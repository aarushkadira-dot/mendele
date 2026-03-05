/**
 * INVESTOR SCORING ENGINE — 75% Algorithmic Component
 *
 * Takes raw investor data from Crunchbase / Harmonic APIs and computes
 * deterministic scores across 5 dimensions. Gemini adds the remaining 25%
 * (contact_strategy, email_hint, engagement_likelihood) in the route layer.
 *
 * Dimensions mapped to ScoredProfile.scores:
 *   topic_match         (0–100, 30% weight) — keyword overlap with query
 *   student_collaboration (0–100, 25% weight) — known early-stage/student focus
 *   availability        (0–100, 20% weight) — inverse of investment frequency
 *   experience_level    (0–100, 15% weight) — tier-based (Partner VC > Angel > Accel)
 *   trend_alignment     (0–100, 10% weight) — recency of on-topic investments
 */

import type { ScoredProfile } from "@/types/researcher"

// ─── Raw investor data (normalised from either API) ───────────────────────────

export interface RawInvestor {
  name: string
  title: string
  firm: string                       // VC firm / organization name
  bio: string                        // Short description / bio
  investmentCount: number            // Total lifetime investments
  recentInvestmentCount: number      // Investments in past 2 years (if available)
  investmentFocus: string            // Categories / verticals they invest in
  linkedinUrl: string
  location: string
  source: "crunchbase" | "harmonic" | "apollo" | "catalog"  // data provenance
}

// ─── Keyword extraction ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "that", "this", "it", "its", "we", "our", "my", "your",
  "i", "want", "need", "looking", "find", "get", "make", "build", "create",
])

export function extractTopicKeywords(topic: string, description?: string): string[] {
  const text = `${topic} ${description ?? ""}`.toLowerCase()
  const words = text.match(/\b[a-z]{3,}\b/g) ?? []
  const unique = [...new Set(words.filter((w) => !STOP_WORDS.has(w)))]
  return unique.slice(0, 15) // cap at 15 significant keywords
}

// ─── Scoring components ───────────────────────────────────────────────────────

/**
 * topic_match (0–100)
 * Counts keyword hits in bio + investmentFocus + firm name.
 */
export function scoreTopicMatch(investor: RawInvestor, keywords: string[]): number {
  if (keywords.length === 0) return 50 // neutral if no topic
  const haystack = `${investor.bio} ${investor.investmentFocus} ${investor.firm}`.toLowerCase()
  const hits = keywords.filter((kw) => haystack.includes(kw)).length
  const pct = hits / keywords.length
  // Non-linear: even 2–3 keyword hits is meaningful
  return Math.round(Math.min(100, (Math.tanh(pct * 3) * 100)))
}

/**
 * student_collaboration (0–100)
 * Does the investor's profile signal early-stage / student founder interest?
 */
const STUDENT_SIGNALS = [
  "pre-seed", "preseed", "pre seed", "seed", "student", "university", "college",
  "founder", "early stage", "early-stage", "dorm room", "undergrad", "high school",
  "young founder", "youth", "youth-led", "first check", "first-check", "angel",
  "accelerator", "incubator", "y combinator", "techstars", "contrary capital",
  "pear vc", "neo", "1517 fund", "hustle fund", "on deck", "fellows",
]

export function scoreStudentCollaboration(investor: RawInvestor): number {
  const haystack = `${investor.bio} ${investor.investmentFocus} ${investor.title} ${investor.firm}`.toLowerCase()
  const hits = STUDENT_SIGNALS.filter((s) => haystack.includes(s)).length
  return Math.round(Math.min(100, 40 + hits * 12)) // baseline 40, each signal +12
}

/**
 * availability (0–100)
 * Inferred from investment frequency — fewer investments = more available.
 */
export function scoreAvailability(investor: RawInvestor): number {
  const count = investor.recentInvestmentCount || investor.investmentCount
  // VC with 50+ deals/yr is hard to reach. Solo angel with 3/yr is accessible.
  if (count === 0) return 70  // unknown → assume moderate
  if (count <= 3)  return 90
  if (count <= 8)  return 75
  if (count <= 20) return 60
  if (count <= 50) return 40
  return 25 // mega fund / very busy
}

/**
 * experience_level (0–100)
 * Tier-based on title and investor type.
 */
export type InvestorTier =
  | "partner_vc"
  | "angel_investor"
  | "accelerator"

export function detectInvestorTier(investor: RawInvestor): InvestorTier {
  const text = `${investor.title} ${investor.firm} ${investor.bio}`.toLowerCase()
  if (/accelerat|incubat|techstars|y combinator|ycombinator|startupbootcamp/.test(text)) {
    return "accelerator"
  }
  if (/angel|individual investor|family office|scout/.test(text)) {
    return "angel_investor"
  }
  return "partner_vc" // default: assume VC role
}

export function scoreExperienceLevel(tier: InvestorTier, investmentCount: number): number {
  const tierBase = tier === "partner_vc" ? 85 : tier === "angel_investor" ? 70 : 60
  const volumeBoost = Math.min(10, Math.floor(investmentCount / 10))
  return Math.min(100, tierBase + volumeBoost)
}

/**
 * trend_alignment (0–100)
 * How recently have they invested on-topic? Uses recent vs total ratio.
 */
export function scoreTrendAlignment(investor: RawInvestor, keywords: string[]): number {
  const topicHit = scoreTopicMatch(investor, keywords)
  // If recent count is high relative to total → active in this space now
  const recencyBoost =
    investor.recentInvestmentCount > 0 && investor.investmentCount > 0
      ? Math.min(20, (investor.recentInvestmentCount / investor.investmentCount) * 40)
      : 0
  return Math.round(Math.min(100, topicHit * 0.7 + recencyBoost))
}

// ─── Weighted overall match ───────────────────────────────────────────────────

export function computeOverallMatch(scores: ScoredProfile["scores"]): number {
  return Math.round(
    scores.topic_match          * 0.30 +
    scores.student_collaboration * 0.25 +
    scores.availability          * 0.20 +
    scores.experience_level      * 0.15 +
    scores.trend_alignment       * 0.10
  )
}

// ─── Main scoring function ────────────────────────────────────────────────────

export interface ScoredInvestorRaw {
  rawInvestor: RawInvestor
  tier: InvestorTier
  scores: ScoredProfile["scores"]
  overall_match: number
}

export function scoreInvestor(
  investor: RawInvestor,
  keywords: string[]
): ScoredInvestorRaw {
  const tier = detectInvestorTier(investor)
  const scores: ScoredProfile["scores"] = {
    topic_match:           scoreTopicMatch(investor, keywords),
    student_collaboration: scoreStudentCollaboration(investor),
    availability:          scoreAvailability(investor),
    experience_level:      scoreExperienceLevel(tier, investor.investmentCount),
    trend_alignment:       scoreTrendAlignment(investor, keywords),
  }
  const overall_match = computeOverallMatch(scores)
  return { rawInvestor: investor, tier, scores, overall_match }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

// Source preference order: catalog (curated) > crunchbase > apollo > harmonic
const SOURCE_PRIORITY: Record<RawInvestor["source"], number> = {
  catalog:    4,
  crunchbase: 3,
  apollo:     2,
  harmonic:   1,
}

export function deduplicateInvestors(investors: RawInvestor[]): RawInvestor[] {
  const seen = new Map<string, RawInvestor>()
  for (const inv of investors) {
    const key = inv.name.toLowerCase().replace(/\s+/g, "")
    if (!seen.has(key)) {
      seen.set(key, inv)
    } else {
      const existing = seen.get(key)!
      const incomingPriority = SOURCE_PRIORITY[inv.source] ?? 0
      const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0
      if (incomingPriority > existingPriority) {
        seen.set(key, inv)
      }
    }
  }
  return [...seen.values()]
}
