/**
 * POST /api/business/investors/search
 *
 * 75% Algorithmic + 25% Gemini investor matching pipeline:
 *
 *   Stage 1 — Fetch real data
 *     ├── Crunchbase API (if CRUNCHBASE_API_KEY set)
 *     └── Harmonic API   (if HARMONIC_API_KEY set)
 *     └── Fallback: pure Gemini generation (if neither key present)
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
  detectInvestorTier,
  type RawInvestor,
} from "@/lib/business/investor-scoring"
import type { ScoredProfile } from "@/types/researcher"

export const maxDuration = 30

// ─── Crunchbase API v4 ────────────────────────────────────────────────────────

async function fetchCrunchbase(
  topic: string,
  keywords: string[],
  count: number
): Promise<RawInvestor[]> {
  const key = process.env.CRUNCHBASE_API_KEY
  if (!key) return []

  try {
    // Use top 3 topic keywords to filter investor descriptions
    const topKeywords = keywords.slice(0, 3)

    const body: Record<string, unknown> = {
      field_ids: [
        "first_name",
        "last_name",
        "title",
        "primary_organization",
        "linkedin",
        "location_identifiers",
        "short_description",
        "investor_types",
        "num_investments_funding_rounds",
        "num_investments",
      ],
      query: [
        {
          type: "predicate",
          field_id: "facet_ids",
          operator_id: "includes",
          values: ["investor"],
        },
        // Only include if we have meaningful keywords (avoid over-filtering)
        ...(topKeywords.length >= 2
          ? [
              {
                type: "predicate",
                field_id: "short_description",
                operator_id: "contains",
                values: topKeywords,
              },
            ]
          : []),
      ],
      limit: Math.min(count, 25),
      order: [{ field_id: "num_investments_funding_rounds", sort: "desc" }],
    }

    const res = await fetch("https://api.crunchbase.com/api/v4/searches/people", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-cb-user-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.error("[Crunchbase] HTTP error:", res.status, await res.text())
      return []
    }

    const data = await res.json()
    const entities: any[] = data.entities ?? []

    return entities.map((e): RawInvestor => {
      const p = e.properties ?? {}
      const firstName = (p.first_name ?? "").trim()
      const lastName = (p.last_name ?? "").trim()
      const fullName = [firstName, lastName].filter(Boolean).join(" ")

      return {
        name: fullName || "Unknown",
        title: String(p.title ?? "Investor"),
        firm: String(p.primary_organization?.value ?? ""),
        bio: String(p.short_description ?? ""),
        investmentCount: Number(p.num_investments ?? p.num_investments_funding_rounds ?? 0),
        recentInvestmentCount: 0,         // Crunchbase basic tier doesn't break out recency
        investmentFocus: (p.investor_types ?? []).join(", "),
        linkedinUrl: String(p.linkedin?.value ?? ""),
        location: (p.location_identifiers ?? [])
          .filter((l: any) => l.location_type === "city")
          .map((l: any) => l.value)
          .join(", "),
        source: "crunchbase",
      }
    })
  } catch (err) {
    console.error("[Crunchbase] Fetch error:", err)
    return []
  }
}

// ─── Harmonic API ─────────────────────────────────────────────────────────────

async function fetchHarmonic(
  topic: string,
  keywords: string[],
  count: number
): Promise<RawInvestor[]> {
  const key = process.env.HARMONIC_API_KEY
  if (!key) return []

  try {
    // Harmonic people search — search by keyword + filter to investors
    const body = {
      filter: {
        // Filter to people with investor-related titles
        "current_title_role_type": ["investor", "venture_capital"],
        "current_employee_count_range": null,
      },
      search: keywords.slice(0, 5).join(" ") || topic,
      size: Math.min(count, 25),
      page: 0,
    }

    const res = await fetch("https://api.harmonic.ai/search/persons", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.error("[Harmonic] HTTP error:", res.status, await res.text())
      return []
    }

    const data = await res.json()
    // Harmonic may return results under different keys depending on version
    const results: any[] = data.results ?? data.people ?? data.data ?? []

    return results.map((p: any): RawInvestor => {
      const company =
        p.current_company?.display_name ??
        p.current_company?.name ??
        p.company?.display_name ??
        p.company?.name ??
        p.firm ?? ""

      return {
        name: String(p.name ?? p.full_name ?? "Unknown"),
        title: String(p.title ?? p.current_title ?? "Investor"),
        firm: String(company),
        bio: String(p.bio ?? p.summary ?? p.description ?? ""),
        investmentCount: Number(p.investment_count ?? p.num_investments ?? 0),
        recentInvestmentCount: Number(p.recent_investment_count ?? 0),
        investmentFocus: (Array.isArray(p.investment_focus)
          ? p.investment_focus.join(", ")
          : String(p.investment_focus ?? p.verticals ?? "")),
        linkedinUrl: String(p.linkedin_url ?? p.linkedin ?? ""),
        location: String(p.location ?? p.city ?? ""),
        source: "harmonic",
      }
    })
  } catch (err) {
    console.error("[Harmonic] Fetch error:", err)
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
- email_hint should be based on their firm domain if known, e.g. partner@firmname.com
- contact_strategy must be specific to THEIR portfolio / focus area`

async function enrichWithGemini(
  investors: RawInvestor[],
  topic: string,
  description: string,
  studentName: string
): Promise<Map<string, { contact_strategy: string; email_hint: string; engagement_likelihood: number }>> {
  const result = new Map<string, { contact_strategy: string; email_hint: string; engagement_likelihood: number }>()

  if (!googleAI || investors.length === 0) return result

  const investorList = investors
    .map(
      (inv, i) =>
        `${i + 1}. ${inv.name} — ${inv.title} at ${inv.firm}. Bio: ${inv.bio.slice(0, 120)}. Focus: ${inv.investmentFocus}.`
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
      maxTokens: 1500,
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

// ─── Pure Gemini fallback (no API keys) ──────────────────────────────────────

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
      source: "crunchbase" as const,
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
  enrichment: { contact_strategy: string; email_hint: string; engagement_likelihood: number }
): ScoredProfile {
  const { rawInvestor, tier, scores, overall_match } = scoreInvestor(investor, keywords)

  return {
    name: rawInvestor.name,
    title: rawInvestor.title,
    institution: rawInvestor.firm,
    department: rawInvestor.location,
    type: "investor",
    profile_tier: tier,
    research_focus: rawInvestor.bio || rawInvestor.investmentFocus,
    evidence_of_student_work:
      rawInvestor.investmentFocus
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

    const hasCrunchbase = !!process.env.CRUNCHBASE_API_KEY
    const hasHarmonic = !!process.env.HARMONIC_API_KEY
    const hasAnyKey = hasCrunchbase || hasHarmonic

    let results: ScoredProfile[]

    if (hasAnyKey) {
      // ── Stage 1: Fetch from real databases in parallel ──
      const [cbInvestors, harmonicInvestors] = await Promise.all([
        hasCrunchbase ? fetchCrunchbase(topic, keywords, count) : Promise.resolve([]),
        hasHarmonic   ? fetchHarmonic(topic, keywords, count)   : Promise.resolve([]),
      ])

      const merged = deduplicateInvestors([...cbInvestors, ...harmonicInvestors])

      // ── Stage 2: Algorithmic scoring (75%) ──
      const scored = merged
        .map((inv) => scoreInvestor(inv, keywords))
        .sort((a, b) => b.overall_match - a.overall_match)
        .slice(0, Math.min(count, 15))

      // ── Stage 3: Gemini enrichment (25%) ──
      const enrichments = await enrichWithGemini(
        scored.map((s) => s.rawInvestor),
        topic,
        description,
        studentName
      )

      results = scored.map((s) => {
        const enrichment = enrichments.get(s.rawInvestor.name.toLowerCase()) ?? {
          contact_strategy: `Research ${s.rawInvestor.firm}'s recent investments before reaching out.`,
          email_hint: s.rawInvestor.firm
            ? `firstname@${s.rawInvestor.firm.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "")}.com`
            : "",
          engagement_likelihood: 25,
        }
        return assembleScoredProfile(s.rawInvestor, keywords, enrichment)
      })
    } else {
      // ── Pure Gemini fallback (no API keys configured) ──
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
        sources: [
          ...(hasCrunchbase ? ["crunchbase"] : []),
          ...(hasHarmonic   ? ["harmonic"]   : []),
          ...(!hasAnyKey    ? ["gemini"]     : ["gemini-enriched"]),
        ],
        topic_keywords: keywords,
      },
    })
  } catch (error: any) {
    console.error("[InvestorSearch] Error:", error)
    return NextResponse.json({ error: "Failed to search investors" }, { status: 500 })
  }
}
