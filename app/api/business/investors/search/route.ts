/**
 * POST /api/business/investors/search
 *
 * Hybrid investor matching: 85% algorithmic + 15% AI semantic boost.
 *
 * Pipeline:
 *   1. Tokenize topic + description into keywords
 *   2. Load static investor catalog (data/investors-catalog.json, cached in-memory)
 *   3. Score every investor algorithmically across 7 dimensions  → overall_match (85%)
 *   4. Batch one Gemini call on top-20 candidates for semantic alignment → ai_score (15%)
 *   5. Blend: final_score = algorithmic * 0.85 + ai_score * 0.15
 *   6. Re-sort by final_score, return top N
 *
 * Graceful degradation: if Gemini fails (auth, network, timeout), the AI step is
 * silently skipped and the result is 100% algorithmic. System never returns 0 results.
 *
 * Response: { results: ScoredProfile[], meta: { sources, topic_keywords, ai_boost } }
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/supabase/server"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"
import { googleAI } from "@/lib/ai/google-model-manager"
import {
  tokenize,
  loadInvestorCatalog,
  matchInvestors,
  catalogInvestorToScoredProfile,
  type MatchedInvestor,
} from "@/lib/business/investor-matching"

export const maxDuration = 20 // allows time for the single Gemini batch call

// ─── AI Semantic Boost (15%) ─────────────────────────────────────────────────
// One batched Gemini call that semantically rates investor ↔ startup alignment.
// Understands synonyms, adjacent spaces, and indirect relevance that keyword
// matching misses (e.g. "machine learning" = "AI", "tutoring" ≈ "edtech").

const SEMANTIC_PROMPT = `You are an expert venture capital analyst matching investors to a student startup.

STARTUP:
Topic: {topic}
Description: {description}

Rate each investor 0-100 on how well their investment focus SEMANTICALLY aligns with this startup.
Consider: synonyms, adjacent verticals, indirect relevance, stage fit for a student founder.

Scoring guide:
  90-100  Direct match (edtech investor + tutoring startup)
  70-89   Adjacent space (enterprise SaaS investor + B2B edtech tool)
  50-69   General tech investor who plausibly invests here
  30-49   Weak or tangential alignment
  0-29    No apparent alignment

Return ONLY valid JSON, no markdown, no explanation:
{"scores": [{"name": "<exact investor name>", "score": <integer 0-100>}]}

INVESTORS TO RATE:
{investorList}`

async function computeAISemanticScores(
  candidates: MatchedInvestor[],
  topic: string,
  description: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>()

  if (!googleAI || candidates.length === 0) return result

  const investorList = candidates
    .map(
      (m, i) =>
        `${i + 1}. ${m.investor.name} (${m.investor.firm}): invests in ${m.investor.investmentFocus.slice(0, 5).join(", ")}`
    )
    .join("\n")

  const prompt = SEMANTIC_PROMPT
    .replace("{topic}", topic.trim())
    .replace("{description}", description?.trim() || "No additional description provided.")
    .replace("{investorList}", investorList)

  try {
    const res = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 800,
      temperature: 0.1, // near-deterministic for consistent scoring
    })

    const rawText = res.text?.trim() ?? ""
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    for (const s of parsed.scores ?? []) {
      if (s.name && typeof s.score === "number") {
        result.set(String(s.name).toLowerCase(), Math.max(0, Math.min(100, Math.round(s.score))))
      }
    }
  } catch (err) {
    // Non-fatal — falls back to 100% algorithmic silently
    console.warn("[InvestorSearch] AI semantic boost failed, using algorithmic only:", (err as Error).message)
  }

  return result
}

// ─── Score blending ───────────────────────────────────────────────────────────

function blendScores(
  matched: MatchedInvestor[],
  aiScores: Map<string, number>
): MatchedInvestor[] {
  if (aiScores.size === 0) return matched // AI failed → pure algorithmic

  return matched.map((m) => {
    const aiScore = aiScores.get(m.investor.name.toLowerCase())
    if (aiScore === undefined) return m // no AI score for this investor → unchanged

    // 85% algorithmic + 15% AI semantic
    const blendedOverall = Math.round(m.overall_match * 0.85 + aiScore * 0.15)

    return { ...m, overall_match: Math.max(0, Math.min(100, blendedOverall)) }
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ── Rate limit ────────────────────────────────────────────────────────────
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

    // ── Parse request ─────────────────────────────────────────────────────────
    const body = await req.json()
    const { topic, description, count = 5 } = body as {
      topic?: string
      description?: string
      count?: number
    }

    if (!topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 })
    }

    // ── Keyword extraction ─────────────────────────────────────────────────────
    const keywords = tokenize(`${topic} ${description ?? ""}`)

    // ── Load catalog (in-memory after first cold start) ───────────────────────
    const catalog = loadInvestorCatalog()
    if (catalog.length === 0) {
      return NextResponse.json(
        { error: "Investor catalog unavailable. Please try again." },
        { status: 503 }
      )
    }

    // ── Stage 1: Algorithmic scoring (85% of final score) ────────────────────
    // Fetch count + 15 extra candidates so the AI re-ranking has enough to work with
    const candidatePool = Math.min(count + 15, catalog.length)
    const algorithmicMatches = matchInvestors(keywords, catalog, candidatePool)

    // ── Stage 2: AI semantic boost (15% of final score) ──────────────────────
    // Cap to top-20 for the Gemini call — keeps the prompt compact & fast
    const topCandidates = algorithmicMatches.slice(0, Math.min(20, algorithmicMatches.length))
    const aiScores = await computeAISemanticScores(topCandidates, topic, description ?? "")
    const aiBoostApplied = aiScores.size > 0

    // ── Stage 3: Blend + re-sort ──────────────────────────────────────────────
    const blended = blendScores(topCandidates, aiScores)
    blended.sort((a, b) => {
      if (b.overall_match !== a.overall_match) return b.overall_match - a.overall_match
      return b.scores.student_collaboration - a.scores.student_collaboration
    })

    // ── Assemble response ─────────────────────────────────────────────────────
    const results = blended
      .slice(0, count)
      .map(catalogInvestorToScoredProfile)

    return NextResponse.json({
      results,
      meta: {
        sources: aiBoostApplied ? ["catalog", "ai-semantic"] : ["catalog"],
        topic_keywords: keywords,
        catalog_size: catalog.length,
        ai_boost: aiBoostApplied,
      },
    })
  } catch (error: any) {
    console.error("[InvestorSearch] Error:", error)
    return NextResponse.json({ error: "Failed to search investors" }, { status: 500 })
  }
}
