import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/supabase/server"
import { computeMomentumScore, type MomentumBreakdown } from "@/lib/matching/momentum-score"

export const maxDuration = 30

// ── In-memory cache: userId → { breakdown, expires }
const cache = new Map<string, { breakdown: MomentumBreakdown; expires: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Cache hit
    const cached = cache.get(user.id)
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ breakdown: cached.breakdown, cached: true })
    }

    const breakdown = await computeMomentumScore(user.id)

    // Evict old entries if cache is large
    if (cache.size > 500) {
      const now = Date.now()
      for (const [key, val] of cache.entries()) {
        if (val.expires < now) cache.delete(key)
      }
    }

    cache.set(user.id, { breakdown, expires: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ breakdown, cached: false })
  } catch (error) {
    console.error("[MomentumScore] Error:", error)
    return NextResponse.json({ error: "Failed to compute momentum score" }, { status: 500 })
  }
}
