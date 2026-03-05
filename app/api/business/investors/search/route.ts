/**
 * POST /api/business/investors/search
 *
 * 75% Algorithmic + 25% Gemini investor matching pipeline:
 *
 *   Stage 1 — Fetch real data
 *     └── Apollo.io People Search API (if APOLLO_API_KEY set)
 *     └── Fallback: pure Gemini generation (if no key present)
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

async function fetchApollo(
  topic: string,
  keywords: string[],
  count: number
): Promise<RawInvestor[]> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return []

  try {
    const body = {
      api_key: key,
      // Use top 5 keywords as the free-text search query
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
      per_page: Math.min(count * 2, 25), // fetch extras so scoring can filter
    }

    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    })

    if (!res.ok) {
      console.error("[Apollo] HTTP error:", res.status, await res.text())
      return []
    }

    const data = await res.json()
    const people: any[] = data.people ?? []

    return people
      .filter((p) => p.name && p.name !== "Unknown")
      .map((p): RawInvestor => {
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
          investmentCount: 0,           // Apollo people search doesn't expose investment count
          recentInvestmentCount: 0,
          investmentFocus: "",           // Enriched by Gemini in Stage 3
          linkedinUrl: String(p.linkedin_url ?? ""),
          location,
          source: "apollo",
          // Store domain for email hint fallback
          _firmDomain: firmDomain,
        } as RawInvestor & { _firmDomain: string }
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
        `${i + 1}. ${inv.name} — ${inv.title} at ${inv.firm}${(inv as any)._firmDomain ? ` (domain: ${(inv as any)._firmDomain})` : ""}. Bio: ${inv.bio.slice(0, 120)}.`
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

// ─── Pure Gemini fallback (no API key configured) ────────────────────────────

const GEMINI_FALLBACK_PROMPT = `You are a startup advisor helping a high school student find investors for their startup.

STUDENT:
Name: {studentName} | Topic: {topic}
Description: {description}

Find {count} real investors (angels, VCs, accelerators) known to fund or advise early-stage student founders in this space.
Prefer: Contrary Capital, Pear VC, Dorm Room Fund, 1517 Fund, Neo, Hustle Fund, Y Combinator, or individual angels.

Return ONLY valid JSON (no markdown):
{
  "results": [
    {
      "name": "<full name>",
      "title": "<e.g. General Partner>",
      "firm": "<firm name>",
      "bio": "<2-3 sentences about their investment focus and student engagement>",
      "investmentCount": <integer>,
      "recentInvestmentCount": <integer, past 2 years>,
      "investmentFocus": "<comma-separated verticals>",
      "linkedinUrl": "<likely URL or empty string>",
      "location": "<city, state>",
      "contact_strategy": "<ONE specific outreach tip>",
      "email_hint": "<likely email format>",
      "engagement_likelihood": <integer 0-100>
    }
  ]
}`

async function fetchGeminiFallback(
  topic: string,
  description: string,
  studentName: string,
  count: number
): Promise<(RawInvestor & { contact_strategy: string; email_hint: string; engagement_likelihood: number })[]> {
  if (!googleAI) return []

  const prompt = GEMINI_FALLBACK_PROMPT
    .replace("{studentName}", studentName)
    .replace("{topic}", topic)
    .replace("{description}", description || "(no description)")
    .replace("{count}", String(Math.min(count, 10)))

  try {
    const res = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      temperature: 0.3,
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
      engagement_likelihood: Number(r.engagement_likelihood ?? 30),
    }))
  } catch (err) {
    console.error("[InvestorSearch/Gemini fallback] Error:", err)
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

    const hasApollo = !!process.env.APOLLO_API_KEY

    let results: ScoredProfile[]

    if (hasApollo) {
      // ── Stage 1: Fetch from Apollo ──
      const apolloInvestors = await fetchApollo(topic, keywords, count)
      const merged = deduplicateInvestors(apolloInvestors)

      // ── Stage 2: Algorithmic scoring (75%) — sort by score, take top N ──
      const scored = merged
        .map((inv) => scoreInvestor(inv, keywords))
        .sort((a, b) => b.overall_match - a.overall_match)
        .slice(0, Math.min(count, 15))

      // ── Stage 3: Gemini enrichment (25%) — fills investment_focus, contact_strategy, email_hint ──
      const enrichments = await enrichWithGemini(
        scored.map((s) => s.rawInvestor),
        topic,
        description,
        studentName
      )

      results = scored.map((s) => {
        const enrichment = enrichments.get(s.rawInvestor.name.toLowerCase()) ?? {
          investment_focus: "",
          contact_strategy: `Research ${s.rawInvestor.firm || "their firm"}'s recent investments before reaching out.`,
          email_hint: (s.rawInvestor as any)._firmDomain
            ? `firstname@${(s.rawInvestor as any)._firmDomain}`
            : s.rawInvestor.firm
            ? `firstname@${s.rawInvestor.firm.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "")}.com`
            : "",
          engagement_likelihood: 25,
        }
        return assembleScoredProfile(s.rawInvestor, keywords, enrichment)
      })
    } else {
      // ── Pure Gemini fallback (no Apollo key configured) ──
      const geminiResults = await fetchGeminiFallback(topic, description, studentName, count)
      results = geminiResults.map((inv) => {
        const { scores, overall_match, tier } = scoreInvestor(inv, keywords)
        return {
          name: inv.name,
          title: inv.title,
          institution: inv.firm,
          department: inv.location,
          type: "investor" as const,
          profile_tier: tier,
          research_focus: inv.bio,
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
        sources: hasApollo ? ["apollo", "gemini-enriched"] : ["gemini"],
        topic_keywords: keywords,
      },
    })
  } catch (error: any) {
    console.error("[InvestorSearch] Error:", error)
    return NextResponse.json({ error: "Failed to search investors" }, { status: 500 })
  }
}
