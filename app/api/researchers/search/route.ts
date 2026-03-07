import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, createClient } from "@/lib/supabase/server"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"
import { googleAI } from "@/lib/ai/google-model-manager"
import { searchAuthors, broadenQuery } from "@/lib/researchers/semantic-scholar"
import { tokenize, authorToScoredProfile } from "@/lib/researchers/researcher-scoring"
import type { ScoredProfile } from "@/types/researcher"

export const maxDuration = 30

// ─── Optional 15% AI semantic re-rank ─────────────────────────────────────────
// Identical pattern to investor search: single batched Gemini call, graceful fallback.

async function computeAISemanticScores(
  profiles: ScoredProfile[],
  topic: string,
  description: string
): Promise<Map<string, number>> {
  const scores = new Map<string, number>()
  if (!googleAI || profiles.length === 0) return scores

  const candidates = profiles.slice(0, 20).map((p, i) => ({
    idx: i,
    name: p.name,
    institution: p.institution,
    focus: p.research_focus.slice(0, 120),
  }))

  const prompt = `Student topic: "${topic}". ${description ? `Context: "${description}".` : ""}

Rate how semantically relevant each researcher is to this student's topic (0–100). Consider conceptual alignment beyond keyword overlap.

Researchers:
${candidates.map((c) => `${c.idx}. ${c.name} (${c.institution}) — ${c.focus}`).join("\n")}

Return ONLY valid JSON: { "scores": { "0": <int>, "1": <int>, ... } }`

  try {
    const result = await Promise.race([
      googleAI.complete({ messages: [{ role: "user", content: prompt }], maxTokens: 400, temperature: 0.1 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]) as Awaited<ReturnType<typeof googleAI.complete>>

    const cleaned = (result.text ?? "")
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim()
    const parsed = JSON.parse(cleaned)

    for (const [idxStr, val] of Object.entries(parsed.scores ?? {})) {
      const idx = parseInt(idxStr, 10)
      if (!isNaN(idx) && idx < candidates.length) {
        scores.set(candidates[idx].name, Math.max(0, Math.min(100, Number(val))))
      }
    }
  } catch {
    // Graceful degradation — AI boost is optional
  }

  return scores
}

function blendScores(
  profiles: ScoredProfile[],
  aiScores: Map<string, number>
): ScoredProfile[] {
  if (aiScores.size === 0) return profiles

  return profiles.map((p) => {
    const ai = aiScores.get(p.name)
    if (ai === undefined) return p
    const blended = Math.round(p.overall_match * 0.85 + ai * 0.15)
    return { ...p, overall_match: blended }
  })
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimitKey = createRateLimitKey("SUMMARIZE", `researchers:${user.id}`)
    const { success: withinLimit, remaining, reset, limit } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.SUMMARIZE.limit,
      RATE_LIMITS.SUMMARIZE.windowSeconds
    )

    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      )
    }

    const body = await req.json()
    const { topic, description, count = 5 } = body

    if (!topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 })
    }

    // ── Stage 0: tokenize query ─────────────────────────────────────────────
    const keywords = tokenize(`${topic} ${description ?? ""}`)

    // ── Stage 1: Semantic Scholar author search ─────────────────────────────
    // Request enough candidates to have a good scoring pool after filtering
    const SEARCH_LIMIT = Math.min(Math.max(count * 4, 20), 50)
    let authors = await searchAuthors(topic, SEARCH_LIMIT)

    // Fallback: if too few results, try a broadened query
    if (authors.length < 3) {
      const broaderQuery = broadenQuery(topic)
      if (broaderQuery && broaderQuery !== topic.toLowerCase()) {
        const fallback = await searchAuthors(broaderQuery, SEARCH_LIMIT)
        authors = [...authors, ...fallback]
      }
    }

    if (authors.length === 0) {
      return NextResponse.json(
        { error: "No researchers found for this topic. Try a broader search term." },
        {
          status: 200,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      )
    }

    // Deduplicate by authorId
    const seen = new Set<string>()
    const unique = authors.filter((a) => {
      if (seen.has(a.authorId)) return false
      seen.add(a.authorId)
      return true
    })

    // ── Stage 2: Algorithmic scoring ────────────────────────────────────────
    const scored = unique
      .map((author) => authorToScoredProfile(author, keywords))
      .filter((p) => p.overall_match > 0) // drop zero-score profiles
      .sort((a, b) => {
        // Primary: overall_match; tiebreak: student_collaboration
        if (b.overall_match !== a.overall_match) return b.overall_match - a.overall_match
        return b.scores.student_collaboration - a.scores.student_collaboration
      })

    // ── Stage 3: Optional 15% AI semantic boost ─────────────────────────────
    const aiScores = await computeAISemanticScores(scored, topic, description ?? "")
    const blended  = blendScores(scored, aiScores)

    // Re-sort after blend
    blended.sort((a, b) => b.overall_match - a.overall_match)

    const results = blended.slice(0, Math.min(count, 15))

    return NextResponse.json(
      {
        results,
        meta: {
          total_found:  unique.length,
          ai_boost:     aiScores.size > 0,
          source:       "semantic_scholar",
        },
      },
      {
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    )
  } catch (error: any) {
    console.error("[Researchers Search] Error:", error)

    // Semantic Scholar API errors — surface clearly
    if (error?.message?.includes("Semantic Scholar")) {
      return NextResponse.json(
        { error: "Researcher database temporarily unavailable. Try again in a moment." },
        { status: 503 }
      )
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
