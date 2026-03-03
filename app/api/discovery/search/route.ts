import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectPivotLocally } from "@/lib/discovery/intent-detector";
import { parseSearchQuery, scoreDomainMatch, getTypeSearchTerms, fuzzyCorrectQuery } from "@/lib/search/query-parser";

/**
 * GET /api/discovery/search?query=...&limit=...&threshold=...&userProfileId=...&personalizationWeight=...
 *
 * Fast database search for opportunities with intent detection.
 *
 * Strategy:
 * 1. Detect search intent (pivot vs explore) based on user profile
 * 2. Try the backend's semantic search (vector similarity) with a short timeout
 * 3. If the backend is slow (common on cold starts), fall back to a direct
 *    Supabase text search so the user always gets instant results
 * 4. Apply ranking based on personalization weight
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    const limit = parseInt(searchParams.get("limit") || "20");
    const threshold = parseFloat(searchParams.get("threshold") || "0.6");
    const userProfileId = searchParams.get("userProfileId");
    let personalizationWeight = parseFloat(searchParams.get("personalizationWeight") || "1.0");

    if (!query) {
        return NextResponse.json({ results: [], count: 0, error: "Query required" }, { status: 400 });
    }

    // Detect intent if user profile is provided and weight not explicitly set
    if (userProfileId && searchParams.get("personalizationWeight") === null) {
        try {
            const supabase = createAdminClient();
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("interests")
                .eq("user_id", userProfileId)
                .single();

            if (profile?.interests && Array.isArray(profile.interests)) {
                const intentResult = detectPivotLocally(query, profile.interests);
                personalizationWeight = intentResult.personalizationWeight;

                console.log(`[Discovery] Intent: ${intentResult.intent}, confidence: ${intentResult.confidence.toFixed(2)}, weight: ${personalizationWeight}, matched: ${intentResult.matchedInterests.join(', ') || 'none'}`);
            }
        } catch (error) {
            console.error("[Discovery Search] Profile lookup failed, defaulting to explore:", error);
            personalizationWeight = 0.9; // Default to personalized on error
        }
    }

    // Clamp personalization weight to valid range
    personalizationWeight = Math.max(0.0, Math.min(1.0, personalizationWeight));

    // Try backend semantic search with a short timeout
    const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8080";
    const API_TOKEN = process.env.DISCOVERY_API_TOKEN;

    try {
        const backendResult = await fetchBackendSearch(SCRAPER_API_URL, API_TOKEN, query, limit, threshold, personalizationWeight);
        if (backendResult && backendResult.results && backendResult.results.length > 0) {
            return NextResponse.json(backendResult);
        }
    } catch (err: any) {
        console.log(`[Discovery Search] Backend unavailable (${err.message}), falling back to Supabase`);
    }

    // Fallback: direct Supabase text search
    try {
        const results = await directSupabaseSearch(query, limit, personalizationWeight);
        return NextResponse.json({ results, count: results.length });
    } catch (error: any) {
        console.error("[Discovery Search] Supabase fallback error:", error.message);
        return NextResponse.json({ results: [], count: 0 }, { status: 200 });
    }
}

async function fetchBackendSearch(
    baseUrl: string,
    token: string | undefined,
    query: string,
    limit: number,
    threshold: number,
    personalizationWeight: number
) {
    const response = await fetch(`${baseUrl}/api/v1/search`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, limit, threshold, personalization_weight: personalizationWeight }),
        signal: AbortSignal.timeout(8000), // 8s — fail fast on cold starts
    });

    if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
    }

    return response.json();
}

interface SearchResult {
    id: string;
    title: string;
    description: string;
    url: string;
    similarity: number;
    organization?: string;
    category?: string;
    locationType?: string;
    opportunityType?: string;
}

// ─── HS Relevance post-filter ─────────────────────────────────────────────────
const HS_GRADES = new Set([9, 10, 11, 12]);

const ADULT_TITLE_RE = [
    /\bpostdoc(?:toral)?\b/i,
    /\bphd\s+(position|internship|fellowship|candidate)\b/i,
    /\bdoctoral\s+(position|internship|fellowship)\b/i,
    /\bgraduate\s+internship\b/i,
    /\bundergraduate\s+internship\b/i,
    /\bcurrent\s+phd\b/i,
    /\bsenior\s+(software\s+)?(engineer|developer|manager|scientist|researcher)\b/i,
];

function isHsRelevant(row: any): boolean {
    const grades: number[] = row.grade_levels || [];
    if (grades.length > 0 && !grades.some(g => HS_GRADES.has(g))) return false; // middle school only
    const title = (row.title || "").toLowerCase();
    if (ADULT_TITLE_RE.some(re => re.test(title))) return false; // adult job title
    return true;
}

async function directSupabaseSearch(
    query: string,
    limit: number,
    personalizationWeight: number
): Promise<SearchResult[]> {
    const supabase = createAdminClient();

    // Attempt spell correction on the raw query first
    const { corrected, wasChanged } = fuzzyCorrectQuery(query);
    const effectiveQuery = wasChanged ? corrected : query;
    if (wasChanged) {
        console.log(`[Discovery Search] Spell correction: "${query}" → "${corrected}"`);
    }

    const parsed = parseSearchQuery(effectiveQuery);

    console.log(`[Discovery Search] Parsed: domain="${parsed.domainPhrase}", type="${parsed.type}"`);

    // ── Build query conditions based on parsed intent ──
    // We fetch broadly but score precisely
    // Use corrected domain words for keyword matching, not the original misspelled query
    const keywordSource = parsed.domainPhrase
        ? parsed.domain.join(" ")         // Use corrected domain words
        : effectiveQuery                   // Fall back to full corrected query
    const keywords = keywordSource
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2);

    const orConditions = keywords
        .flatMap((kw) => [
            `title.ilike.%${kw}%`,
            `company.ilike.%${kw}%`,
            `category.ilike.%${kw}%`,
            `description.ilike.%${kw}%`,
        ])
        .join(",");

    // Fetch more than needed so we can score and bucket
    const fetchLimit = Math.max(limit * 5, 100);

    const { data, error } = await supabase
        .from("opportunities")
        .select("id, title, description, company, url, source_url, category, location_type, type, skills")
        .eq("is_active", true)
        .neq("title", "Unknown")
        .neq("title", "")
        .or(orConditions)
        .order("created_at", { ascending: false })
        .limit(fetchLimit);

    if (error) {
        console.error("[Discovery Search] Supabase query error:", error);
        throw error;
    }

    if (!data) return [];

    // ── HS relevance pre-filter ──
    const hsData = data.filter(isHsRelevant);

    // ── Structured precision scoring ──
    const typeTerms = parsed.type ? getTypeSearchTerms(parsed.type) : [];

    const scored = hsData.map((row: any) => {
        const titleLower = (row.title || "").toLowerCase();
        const descLower = (row.description || "").toLowerCase();
        const catLower = (row.category || "").toLowerCase();
        const companyLower = (row.company || "").toLowerCase();
        const skillsText = (row.skills || []).map((s: string) => s.toLowerCase()).join(" ");
        const oppText = `${titleLower} ${descLower} ${catLower} ${companyLower} ${skillsText}`;

        let score = 0;

        // ── Type scoring (when user specified a type) ──
        if (parsed.type) {
            const dbType = (row.type || "").toLowerCase();
            if (dbType === parsed.type) {
                score += 40; // DB type column matches exactly
            } else if (typeTerms.some(t => oppText.includes(t))) {
                score += 10; // Type keyword in text but not in type column
            } else {
                score -= 20; // Type NOT found at all — strong penalty
            }
        }

        // ── Domain scoring ──
        if (parsed.domainPhrase) {
            const titleDomain = scoreDomainMatch(row.title || "", parsed);
            const descDomain = scoreDomainMatch(row.description || "", parsed);
            const catDomain = scoreDomainMatch(row.category || "", parsed);
            const skillsDomain = scoreDomainMatch(skillsText, parsed);

            score += titleDomain * 30;  // Domain in title: up to +30
            score += descDomain * 20;   // Domain in description: up to +20
            score += catDomain * 15;    // Domain in category: up to +15
            score += skillsDomain * 15; // Domain in skills: up to +15
        } else {
            // No domain — score by keyword density in title (lighter scoring)
            for (const kw of keywords) {
                if (titleLower.includes(kw)) score += 5;
                if (catLower.includes(kw)) score += 3;
                if (descLower.includes(kw)) score += 1;
            }
        }

        // ── Bonus: exact full query phrase in title (use corrected query) ──
        if (titleLower.includes(effectiveQuery.toLowerCase())) score += 10;

        // Normalize to 0-1 similarity (for display purposes)
        const maxPossible = 40 + 30 + 20 + 15 + 15 + 10; // 130
        const similarity = Math.min(0.98, Math.max(0.1, 0.3 + (score / maxPossible) * 0.68));

        return { row, score, similarity };
    });

    // Filter out low-scoring results
    const minScore = parsed.type ? 20 : 5; // Higher bar when type is specified
    const filtered = scored.filter(({ score }) => score >= minScore);

    // Sort by score descending
    filtered.sort((a, b) => b.score - a.score);

    // Deduplicate by title and return top results
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const { row, similarity } of filtered) {
        const titleKey = row.title.trim().toLowerCase();
        if (seen.has(titleKey)) continue;
        seen.add(titleKey);

        results.push({
            id: row.id,
            title: row.title,
            description: row.description || "",
            url: row.url || row.source_url || "",
            similarity,
            organization: row.company || "",
            category: row.category || "",
            locationType: row.location_type || "",
            opportunityType: row.type || "",
        });

        if (results.length >= limit) break;
    }

    console.log(`[Discovery Search] Returning ${results.length} results (from ${data.length} raw, ${hsData.length} HS-relevant, ${filtered.length} passed scoring)`);

    return results;
}
