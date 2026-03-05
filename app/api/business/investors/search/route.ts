/**
 * POST /api/business/investors/search
 *
 * 100% algorithmic investor matching — ZERO AI, ZERO external API calls.
 *
 * Pipeline:
 *   1. Tokenize topic + description into keywords
 *   2. Load static investor catalog (data/investors-catalog.json, cached in-memory)
 *   3. Score every investor across 7 dimensions (folded into 5 for UI compatibility)
 *   4. Generate contact_strategy, email_hint, engagement_likelihood algorithmically
 *   5. Return top N sorted by overall_match
 *
 * Response shape: { results: ScoredProfile[], meta: { sources, topic_keywords } }
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/supabase/server"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"
import { tokenize } from "@/lib/business/investor-matching"
import {
  loadInvestorCatalog,
  matchInvestors,
  catalogInvestorToScoredProfile,
} from "@/lib/business/investor-matching"

export const maxDuration = 10 // fast — no network calls

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

    // ── Keyword extraction ────────────────────────────────────────────────────
    const keywords = tokenize(`${topic} ${description ?? ""}`)

    // ── Load catalog (cached after first cold start) ──────────────────────────
    const catalog = loadInvestorCatalog()

    if (catalog.length === 0) {
      return NextResponse.json(
        { error: "Investor catalog unavailable. Please try again." },
        { status: 503 }
      )
    }

    // ── Match & score ─────────────────────────────────────────────────────────
    // Ask for count + 5 extras to give the sort more candidates to pick from
    const matched = matchInvestors(keywords, catalog, Math.min(count + 5, catalog.length))

    // ── Convert to ScoredProfile[] ────────────────────────────────────────────
    const results = matched
      .slice(0, count)
      .map(catalogInvestorToScoredProfile)

    return NextResponse.json({
      results,
      meta: {
        sources: ["catalog"],
        topic_keywords: keywords,
        catalog_size: catalog.length,
      },
    })
  } catch (error: any) {
    console.error("[InvestorSearch] Error:", error)
    return NextResponse.json({ error: "Failed to search investors" }, { status: 500 })
  }
}
