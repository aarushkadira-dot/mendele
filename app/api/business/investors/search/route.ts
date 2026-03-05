/**
 * POST /api/business/investors/search
 *
 * 75% Algorithmic + 25% Gemini investor matching pipeline:
 *
 *   Stage 1 — Fetch investor data
 *     ├── Apollo.io People Search API (if APOLLO_API_KEY set + paid plan)
 *     └── Gemini generation fallback (always available)
 *     NOTE: If Apollo returns 0 results (free plan, network error, etc.)
 *           the pipeline automatically falls through to Gemini.
 *
 *   Stage 2 — Algorithmic scoring (75%)
 *     topic_match, student_collaboration, availability,
 *     experience_level, trend_alignment → overall_match
 *
 *   Stage 3 — Gemini enrichment (25%)
 *     contact_strategy, email_hint, engagement_likelihood
 *     (batched in one call for all investors)
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, createClient } from "@/lib/supabase/server"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"
import { googleAI } from "@/lib/ai/google-model-manager"
import {
  extractTopicKeywords,
  scoreInvestor,
  deduplicateInvestors,
  type RawInvestor,
} from "@/lib/business/investor-scoring"
import type { ScoredProfile } from "@/types/researcher"

export const maxDuration = 30

// ─── Apollo.io People Search API ─────────────────────────────────────────────
// Auth: X-Api-Key header (NOT body parameter)
// Endpoint: POST /v1/people/search  (mixed_people/search requires paid plan)
// Free plan: No access to search endpoints (returns 403)
// Basic+ plan: Full access

async function fetchApollo(
  topic: string,
  keywords: string[],
  count: number
): Promise<RawInvestor[]> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return []

  try {
    const body = {
      // Free-text search query from topic keywords
      q_keywords: keywords.slice(0, 5).join(" ") || topic,
      // Filter to investor-related titles
      person_titles: [
        "Partner",
        "General Partner",
        "Managing Partner",
        "Founding Partner",
        "Angel Investor",
        "Investor",
        "Venture Capitalist",
        "Principal",
        "Investment Director",
        "Venture Partner",
        "Scout",
      ],
      page: 1,
      per_page: Math.min(count * 2, 25),
    }

    // Try the /people/search endpoint first (more commonly accessible),
    // then fall back to /mixed_people/search
    const endpoints = [
      "https://api.apollo.io/v1/people/search",
      "https://api.apollo.io/v1/mixed_people/search",
    ]

    let people: any[] = []

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": key,
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.status === 403 || res.status === 401) {
          console.warn(`[Apollo] ${endpoint} — plan restriction (${res.status}), trying next…`)
          continue
        }

        if (!res.ok) {
          console.error(`[Apollo] ${endpoint} — HTTP error:`, res.status)
          continue
        }

        const data = await res.json()
        people = data.people ?? []
        if (people.length > 0) {
          console.log(`[Apollo] ${endpoint} — found ${people.length} results`)
          break
        }
      } catch (endpointErr) {
        console.warn(`[Apollo] ${endpoint} — error:`, endpointErr)
        continue
      }
    }

    if (people.length === 0) {
      console.log("[Apollo] No results from any endpoint — will fall through to Gemini")
      return []
    }

    return people
      .filter((p: any) => p.name && p.name !== "Unknown")
      .map((p: any): RawInvestor => {
        const firstName = String(p.first_name ?? "").trim()
        const lastName = String(p.last_name ?? "").trim()
        const fullName = p.name ?? [firstName, lastName].filter(Boolean).join(" ") ?? "Unknown"

        // Build location string
        const locationParts = [p.city, p.state, p.country].filter(Boolean)
        const location = locationParts.join(", ")

        // Firm domain for email hint construction downstream
        const firmDomain =
          p.organization?.primary_domain ??
          p.account?.domain ??
          ""

        // Combine headline + bio for bio field
        const bio = [p.headline, p.employment_history?.[0]?.description]
          .filter(Boolean)
          .join(". ")

        return {
          name: String(fullName),
          title: String(p.title ?? "Investor"),
          firm: String(p.organization_name ?? p.account_name ?? ""),
          bio: String(bio || p.seo_description || ""),
          investmentCount: 0,
          recentInvestmentCount: 0,
          investmentFocus: "",
          linkedinUrl: String(p.linkedin_url ?? ""),
          location,
          source: "apollo",
        }
      })
  } catch (err) {
    console.error("[Apollo] Fetch error:", err)
    return []
  }
}

// ─── Gemini enrichment prompt ─────────────────────────────────────────────────

const ENRICH_PROMPT = `You are a startup advisor helping a student founder reach out to investors.

STUDENT STARTUP TOPIC: {topic}
STUDENT DESCRIPTION: {description}
STUDENT NAME: {studentName}

For each of the following investors, provide a personalized outreach strategy.
Return ONLY valid JSON (no markdown):

{
  "enrichments": [
    {
      "name": "<exact investor name as given>",
      "investment_focus": "<comma-separated verticals they invest in, e.g. 'AI, edtech, fintech'>",
      "contact_strategy": "<ONE specific thing to mention in outreach — e.g. 'Reference their investment in TutorAI which is similar to your product'>",
      "email_hint": "<most likely email format, e.g. 'mark@upfront.vc' or 'mark.suster@upfront.vc'>",
      "engagement_likelihood": <integer 0-100, realistic % chance they reply to a cold email from a student founder>
    }
  ]
}

INVESTORS TO ENRICH:
{investorList}

Rules:
- engagement_likelihood for a student founder is typically 10-35% — be realistic, not optimistic
- email_hint should use the firm domain if provided, e.g. partner@firmname.com
- contact_strategy must be specific to THEIR portfolio / focus area
- investment_focus should reflect their known or likely investment verticals`

async function enrichWithGemini(
  investors: RawInvestor[],
  topic: string,
  description: string,
  studentName: string
): Promise<Map<string, { investment_focus: string; contact_strategy: string; email_hint: string; engagement_likelihood: number }>> {
  const result = new Map<string, { investment_focus: string; contact_strategy: string; email_hint: string; engagement_likelihood: number }>()

  if (!googleAI || investors.length === 0) return result

  const investorList = investors
    .map(
      (inv, i) =>
        `${i + 1}. ${inv.name} — ${inv.title} at ${inv.firm}. Bio: ${inv.bio.slice(0, 120)}.`
    )
    .join("\n")

  const prompt = ENRICH_PROMPT
    .replace("{topic}", topic)
    .replace("{description}", description || "(no description provided)")
    .replace("{studentName}", studentName)
    .replace("{investorList}", investorList)

  try {
    const res = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1800,
      temperature: 0.2,
    })

    const rawText = res.text?.trim() ?? ""
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    for (const e of parsed.enrichments ?? []) {
      if (e.name) {
        result.set(e.name.toLowerCase(), {
          investment_focus: String(e.investment_focus ?? ""),
          contact_strategy: String(e.contact_strategy ?? ""),
          email_hint: String(e.email_hint ?? ""),
          engagement_likelihood: Number(e.engagement_likelihood ?? 30),
        })
      }
    }
  } catch (err) {
    console.error("[InvestorSearch/Gemini enrichment] Error:", err)
    // Non-fatal — investors still returned with empty enrichment fields
  }

  return result
}

// ─── Gemini investor generation (primary source when Apollo unavailable) ─────
// This is NOT a "fallback" — Gemini knows real-world investors and generates
// accurate profiles. When Apollo upgrades to paid, both sources merge.

const GEMINI_INVESTOR_PROMPT = `You are a knowledgeable startup ecosystem advisor.
Find REAL investors who would be interested in this student's startup.

STUDENT:
Name: {studentName} | Topic: {topic}
Description: {description}

Return {count} REAL, VERIFIED investors (angels, VCs, accelerators) known to invest in this space.
STRONG PREFERENCE: investors known to support student/young founders:
- Contrary Capital, Pear VC, Dorm Room Fund, 1517 Fund, Neo, Hustle Fund,
  Y Combinator, Techstars, First Round Capital, Floodgate, General Catalyst,
  SV Angel, Initialized Capital, a16z Scout, Sequoia Scout

Include both well-known and emerging investors. Mix VCs, angels, and accelerators.
Every investor MUST be a real person or program — do NOT invent fictional investors.

Return ONLY valid JSON (no markdown, no explanation):
{
  "results": [
    {
      "name": "<real full name>",
      "title": "<their real title, e.g. General Partner>",
      "firm": "<real firm name>",
      "bio": "<2-3 factual sentences about their investment focus and student/early-stage engagement>",
      "investmentCount": <realistic integer estimate>,
      "recentInvestmentCount": <integer estimate, past 2 years>,
      "investmentFocus": "<comma-separated verticals they actually invest in>",
      "linkedinUrl": "<likely LinkedIn URL or empty string>",
      "location": "<city, state>",
      "contact_strategy": "<ONE specific outreach tip tailored to THIS investor>",
      "email_hint": "<most likely email format, e.g. firstname@firm.com>",
      "engagement_likelihood": <integer 10-40, realistic % chance they reply to a student cold email>
    }
  ]
}

CRITICAL RULES:
- ONLY include real people/programs. If unsure, skip them.
- engagement_likelihood for student founders is typically 10-35% — be REALISTIC
- Diversify: include at least 1 angel, 1 VC, 1 accelerator/program
- contact_strategy must reference something specific about their portfolio or interests`

async function fetchGeminiInvestors(
  topic: string,
  description: string,
  studentName: string,
  count: number
): Promise<(RawInvestor & { contact_strategy: string; email_hint: string; engagement_likelihood: number })[]> {
  if (!googleAI) return []

  const prompt = GEMINI_INVESTOR_PROMPT
    .replace("{studentName}", studentName)
    .replace("{topic}", topic)
    .replace("{description}", description || "(no description)")
    .replace("{count}", String(Math.min(count + 3, 12))) // ask for extras to ensure quality

  try {
    const res = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2500,
      temperature: 0.4,
    })

    const rawText = res.text?.trim() ?? ""
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    return (parsed.results ?? []).map((r: any) => ({
      name: String(r.name ?? "Unknown"),
      title: String(r.title ?? "Investor"),
      firm: String(r.firm ?? ""),
      bio: String(r.bio ?? ""),
      investmentCount: Number(r.investmentCount ?? 0),
      recentInvestmentCount: Number(r.recentInvestmentCount ?? 0),
      investmentFocus: String(r.investmentFocus ?? ""),
      linkedinUrl: String(r.linkedinUrl ?? ""),
      location: String(r.location ?? ""),
      source: "apollo" as const,
      contact_strategy: String(r.contact_strategy ?? ""),
      email_hint: String(r.email_hint ?? ""),
      engagement_likelihood: Number(r.engagement_likelihood ?? 25),
    }))
  } catch (err) {
    console.error("[InvestorSearch/Gemini generation] Error:", err)
    return []
  }
}

// ─── Assemble ScoredProfile ───────────────────────────────────────────────────

function assembleScoredProfile(
  investor: RawInvestor,
  keywords: string[],
  enrichment: { investment_focus?: string; contact_strategy: string; email_hint: string; engagement_likelihood: number }
): ScoredProfile {
  // Merge Gemini-enriched investment focus back into investor for better scoring
  const enrichedInvestor: RawInvestor = {
    ...investor,
    investmentFocus: enrichment.investment_focus || investor.investmentFocus,
  }

  const { rawInvestor, tier, scores, overall_match } = scoreInvestor(enrichedInvestor, keywords)

  return {
    name: rawInvestor.name,
    title: rawInvestor.title,
    institution: rawInvestor.firm,
    department: rawInvestor.location,
    type: "investor",
    profile_tier: tier,
    research_focus: enrichment.investment_focus || rawInvestor.bio || rawInvestor.investmentFocus,
    evidence_of_student_work:
      enrichment.investment_focus
        ? `Investment focus: ${enrichment.investment_focus}`
        : rawInvestor.investmentFocus
        ? `Investment focus: ${rawInvestor.investmentFocus}`
        : "Early-stage investor",
    scores,
    overall_match,
    engagement_likelihood: enrichment.engagement_likelihood,
    years_experience: Math.max(1, Math.floor(rawInvestor.investmentCount / 5)),
    active_projects: rawInvestor.investmentCount,
    contact_strategy: enrichment.contact_strategy,
    email_hint: enrichment.email_hint,
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit
    const rateLimitKey = createRateLimitKey("SUMMARIZE", `investor-search:${user.id}`)
    const { success: withinLimit } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.SUMMARIZE.limit,
      RATE_LIMITS.SUMMARIZE.windowSeconds
    )
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { topic, description, count = 5 } = body

    if (!topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 })
    }

    // Fetch student name for enrichment personalisation
    const supabase = await createClient()
    const { data: userData } = await (supabase.from("users") as any)
      .select("name")
      .eq("id", user.id)
      .single()
    const studentName: string = (userData?.name as string) || "A student founder"

    const keywords = extractTopicKeywords(topic, description)

    let results: ScoredProfile[]
    let dataSources: string[] = []

    // ── Stage 1: Try Apollo first (if key configured) ──
    let rawInvestors: RawInvestor[] = []
    if (process.env.APOLLO_API_KEY) {
      rawInvestors = await fetchApollo(topic, keywords, count)
      if (rawInvestors.length > 0) {
        dataSources.push("apollo")
      }
    }

    if (rawInvestors.length > 0) {
      // ── Apollo returned data → algorithmic scoring + Gemini enrichment ──
      const merged = deduplicateInvestors(rawInvestors)

      // Stage 2: Algorithmic scoring (75%)
      const scored = merged
        .map((inv) => scoreInvestor(inv, keywords))
        .sort((a, b) => b.overall_match - a.overall_match)
        .slice(0, Math.min(count, 15))

      // Stage 3: Gemini enrichment (25%)
      const enrichments = await enrichWithGemini(
        scored.map((s) => s.rawInvestor),
        topic,
        description,
        studentName
      )
      dataSources.push("gemini-enriched")

      results = scored.map((s) => {
        const enrichment = enrichments.get(s.rawInvestor.name.toLowerCase()) ?? {
          investment_focus: "",
          contact_strategy: `Research ${s.rawInvestor.firm || "their firm"}'s recent investments before reaching out.`,
          email_hint: s.rawInvestor.firm
            ? `firstname@${s.rawInvestor.firm.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "")}.com`
            : "",
          engagement_likelihood: 25,
        }
        return assembleScoredProfile(s.rawInvestor, keywords, enrichment)
      })
    } else {
      // ── Apollo unavailable or returned 0 → Gemini investor generation ──
      // Gemini generates profiles of real investors + enrichment in one pass
      console.log("[InvestorSearch] Using Gemini investor generation (Apollo returned 0 results)")
      dataSources.push("gemini")

      const geminiResults = await fetchGeminiInvestors(topic, description, studentName, count)

      results = geminiResults.map((inv) => {
        const { scores, overall_match, tier } = scoreInvestor(inv, keywords)
        return {
          name: inv.name,
          title: inv.title,
          institution: inv.firm,
          department: inv.location,
          type: "investor" as const,
          profile_tier: tier,
          research_focus: inv.investmentFocus || inv.bio,
          evidence_of_student_work: inv.investmentFocus
            ? `Investment focus: ${inv.investmentFocus}`
            : "Early-stage investor",
          scores,
          overall_match,
          engagement_likelihood: inv.engagement_likelihood,
          years_experience: Math.max(1, Math.floor(inv.investmentCount / 5)),
          active_projects: inv.investmentCount,
          contact_strategy: inv.contact_strategy,
          email_hint: inv.email_hint,
        }
      }).sort((a, b) => b.overall_match - a.overall_match)
    }

    return NextResponse.json({
      results,
      meta: {
        sources: dataSources,
        topic_keywords: keywords,
      },
    })
  } catch (error: any) {
    console.error("[InvestorSearch] Error:", error)
    return NextResponse.json({ error: "Failed to search investors" }, { status: 500 })
  }
}
