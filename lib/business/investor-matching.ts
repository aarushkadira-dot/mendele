/**
 * INVESTOR MATCHING ENGINE — 100% Algorithmic, Zero AI
 *
 * Loads a static catalog of 80+ real investors and scores them against the
 * user's startup topic using a 7-dimension algorithm that folds into the
 * 5-score ScoredProfile shape the UI already understands.
 *
 * Dimension → ScoredProfile score mapping:
 *
 *   topic_match          (catalog-enhanced TF-IDF)     → scores.topic_match          (30%)
 *   student_collaboration (signals + studentFriendly)   → scores.student_collaboration (25%)
 *   availability + check_size_fit                       → scores.availability          (20%)
 *   experience_level     (tier-based)                   → scores.experience_level      (15%)
 *   trend_alignment + stage_fit                         → scores.trend_alignment       (10%)
 *
 * No external HTTP calls. No Gemini. No OpenAI. No Apollo.
 * Runs entirely in-process in ~1ms for 80+ investors.
 */

import path from "path"
import fs from "fs"
import type { ScoredProfile } from "@/types/researcher"
import {
  detectInvestorTier,
  scoreExperienceLevel,
  scoreAvailability,
  type InvestorTier,
} from "./investor-scoring"

// ─── Catalog Types ────────────────────────────────────────────────────────────

export interface CatalogInvestor {
  id: string
  name: string
  title: string
  firm: string
  firmDomain: string
  bio: string
  investmentFocus: string[]         // e.g. ["AI", "edtech", "fintech"]
  stagePreferences: string[]        // e.g. ["pre-seed", "seed"]
  checkSizeRange: [number, number]  // [min, max] in USD
  location: string
  studentFriendly: boolean
  studentSignals: string[]          // e.g. ["student_founders", "dorm_room_fund"]
  accessibilitySignals: string[]    // e.g. ["application_form", "twitter_active"]
  notableInvestments: string[]      // e.g. ["Airbnb", "Stripe"]
  linkedinUrl: string
  applicationUrl: string
  investmentCount: number
  recentInvestmentCount: number
  tier: InvestorTier
}

// ─── Catalog loader (cached after first read) ─────────────────────────────────

let _catalogCache: CatalogInvestor[] | null = null

export function loadInvestorCatalog(): CatalogInvestor[] {
  if (_catalogCache) return _catalogCache

  // Resolve relative to project root (works in Next.js edge & node runtimes)
  const catalogPath = path.join(process.cwd(), "data", "investors-catalog.json")

  try {
    const raw = fs.readFileSync(catalogPath, "utf-8")
    _catalogCache = JSON.parse(raw) as CatalogInvestor[]
    return _catalogCache
  } catch (err) {
    console.error("[InvestorCatalog] Failed to load catalog:", err)
    return []
  }
}

// ─── Keyword helpers ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "that", "this", "it", "its", "we", "our", "my", "your",
  "i", "want", "need", "looking", "find", "get", "make", "build", "create",
  "startup", "company", "business", "product", "app", "platform", "tool",
  "using", "use", "help", "like", "can", "will", "would", "should", "could",
])

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))]
}

// ─── Scoring Dimension 1: Topic Match ─────────────────────────────────────────
// Enhanced over base investor-scoring.ts: searches investmentFocus[], bio,
// notableInvestments, and firm name. Gives extra weight to exact focus matches.

function scoreTopicMatchCatalog(investor: CatalogInvestor, keywords: string[]): number {
  if (keywords.length === 0) return 50

  const focusText = investor.investmentFocus.join(" ").toLowerCase()
  const bioText = investor.bio.toLowerCase()
  const notableText = investor.notableInvestments.join(" ").toLowerCase()
  const firmText = investor.firm.toLowerCase()

  let hits = 0
  let exactFocusHits = 0

  for (const kw of keywords) {
    const inFocus = focusText.includes(kw)
    const inBio = bioText.includes(kw)
    const inNotable = notableText.includes(kw)
    const inFirm = firmText.includes(kw)

    if (inFocus) { hits += 2; exactFocusHits++ } // double weight for focus match
    else if (inBio) hits += 1
    else if (inNotable) hits += 0.5
    else if (inFirm) hits += 0.5
  }

  // Max possible hits = keywords.length * 2 (all in focus)
  const maxHits = keywords.length * 2
  const ratio = hits / maxHits

  // tanh for non-linear scaling: even 20% hit rate returns ~55
  let score = Math.round(Math.min(100, Math.tanh(ratio * 3) * 100))

  // Bonus: if investor has 2+ exact focus area matches → significant relevance signal
  if (exactFocusHits >= 2) score = Math.min(100, score + 15)

  return score
}

// ─── Scoring Dimension 2: Student Collaboration ───────────────────────────────
// Uses structured catalog fields: studentFriendly flag + studentSignals array.

const STUDENT_SIGNAL_WEIGHTS: Record<string, number> = {
  "student_founders":       15,
  "dorm_room_fund":         15,
  "young_founder_program":  12,
  "student_run":            15,
  "high_school":            18, // particularly strong for this platform
  "thiel_fellowship":       10,
  "fellowship":              8,
  "campus_community":        8,
  "accelerator":             5,
  "zero_equity":             5,
  "university_partnerships": 8,
  "technical_founders":      5,
  "underrepresented_founders": 7,
  "remote_friendly":         4,
  "co-founder_matching":     6,
  "accessible_investor":    10,
  "pre-seed":                6,
  "early_stage":             6,
}

function scoreStudentCollaborationCatalog(investor: CatalogInvestor): number {
  let score = investor.studentFriendly ? 55 : 35 // structured base

  for (const signal of investor.studentSignals) {
    score += STUDENT_SIGNAL_WEIGHTS[signal] ?? 5
  }

  // Accelerators are inherently more accessible to early founders
  if (investor.tier === "accelerator") score += 8

  // Zero-equity programs are ideal for students
  if (investor.checkSizeRange[0] === 0) score += 5

  return Math.min(100, Math.max(0, score))
}

// ─── Scoring Dimension 3: Availability + Check Size Fit ───────────────────────
// Combines "how busy is this investor" with "does their check size fit a student"

function scoreAvailabilityAndCheckSize(investor: CatalogInvestor): number {
  // Base availability from deal volume (reuse existing logic via a proxy RawInvestor)
  const proxyRaw = {
    investmentCount: investor.investmentCount,
    recentInvestmentCount: investor.recentInvestmentCount,
  } as any
  const baseAvailability = scoreAvailability(proxyRaw)

  // Check size fit for student startups (typically need $0–$500K)
  const STUDENT_MIN = 0
  const STUDENT_MAX = 500_000
  const [invMin, invMax] = investor.checkSizeRange

  let checkFit: number
  if (invMax === 0) {
    // Grant/fellowship — free money, extremely accessible
    checkFit = 95
  } else if (invMin <= STUDENT_MAX && invMax >= STUDENT_MIN) {
    // Full or partial overlap with student range
    const overlap = Math.min(invMax, STUDENT_MAX) - Math.max(invMin, STUDENT_MIN)
    const investorRange = Math.max(1, invMax - invMin)
    checkFit = 60 + Math.round((overlap / investorRange) * 40)
  } else if (invMin <= 1_000_000) {
    // Just above student range — still potentially reachable
    checkFit = 40
  } else {
    // Way above student range (Series B+ focus)
    checkFit = 15
  }

  // Blend 60% availability + 40% check fit
  return Math.round(baseAvailability * 0.6 + checkFit * 0.4)
}

// ─── Scoring Dimension 4: Experience Level ────────────────────────────────────
// Reuse base logic directly from investor-scoring.ts

function scoreExperienceLevelCatalog(investor: CatalogInvestor): number {
  return scoreExperienceLevel(investor.tier, investor.investmentCount)
}

// ─── Scoring Dimension 5: Trend Alignment + Stage Fit ────────────────────────
// Combines recency of investments with how well stage preferences align

const STAGE_SCORES: Record<string, number> = {
  "pre-seed": 100,
  "seed":     85,
  "series-a": 50,
  "series-b": 25,
  "growth":   10,
}

function scoreTrendAndStageFit(investor: CatalogInvestor, topicScore: number): number {
  // Recency boost: high recent:total ratio → actively investing now
  const recencyBoost =
    investor.recentInvestmentCount > 0 && investor.investmentCount > 0
      ? Math.min(20, (investor.recentInvestmentCount / investor.investmentCount) * 40)
      : 0

  // Stage fit: student startups are almost always pre-seed or seed
  const stageScores = investor.stagePreferences.map((s) => STAGE_SCORES[s] ?? 30)
  const stageFit = stageScores.length > 0
    ? Math.max(...stageScores) // take best stage match
    : 50 // unknown → neutral

  // Blend: 40% topic relevance + 40% stage fit + 20% recency
  return Math.round(Math.min(100, topicScore * 0.4 + stageFit * 0.4 + recencyBoost * 0.2))
}

// ─── Weighted overall match ───────────────────────────────────────────────────

function computeOverallMatchCatalog(scores: ScoredProfile["scores"]): number {
  return Math.round(
    scores.topic_match           * 0.30 +
    scores.student_collaboration * 0.25 +
    scores.availability          * 0.20 +
    scores.experience_level      * 0.15 +
    scores.trend_alignment       * 0.10
  )
}

// ─── Engagement Likelihood ────────────────────────────────────────────────────
// Purely algorithmic estimate of % chance a student cold email gets a reply.

const ACCESSIBILITY_WEIGHTS: Record<string, number> = {
  "application_form": 15, // structured channel → very likely to get response
  "open_dms":         10, // explicitly open for messages
  "office_hours":      8, // scheduled access
  "twitter_active":    5, // public presence → findable
}

export function computeEngagementLikelihood(
  investor: CatalogInvestor,
  topicMatchScore: number
): number {
  let score = 12 // cold email baseline for student founders

  // Accessibility signals
  for (const signal of investor.accessibilitySignals) {
    score += ACCESSIBILITY_WEIGHTS[signal] ?? 0
  }

  // Application URL = guaranteed formal channel
  if (investor.applicationUrl) score += 15

  // Student-friendliness
  if (investor.studentFriendly) score += 10

  // Accelerators are explicitly built to accept applications
  if (investor.tier === "accelerator") score += 8

  // Topic relevance → investor more likely to engage
  if (topicMatchScore >= 80) score += 6
  else if (topicMatchScore >= 60) score += 3

  // Volume penalty: bigger funds are harder to reach
  if (investor.investmentCount > 300) score -= 10
  else if (investor.investmentCount > 100) score -= 5

  return Math.max(5, Math.min(55, Math.round(score)))
}

// ─── Contact Strategy Generator ───────────────────────────────────────────────
// Template-based — zero AI. Priority chain based on structured investor data.

export function generateContactStrategy(
  investor: CatalogInvestor,
  keywords: string[]
): string {
  // Priority 1: Has a formal application URL
  if (investor.applicationUrl) {
    return `Apply directly through ${investor.firm}'s open application at ${investor.applicationUrl} — they actively review student founders.`
  }

  // Priority 2: Specific notable investment in same vertical
  const relevantInvestment = investor.notableInvestments.find((inv) =>
    keywords.some((kw) => inv.toLowerCase().includes(kw))
  )
  if (relevantInvestment) {
    return `Reference their portfolio company ${relevantInvestment}, which is in a closely related space, when reaching out to ${investor.name}.`
  }

  // Priority 3: Explicit student-founder program
  if (
    investor.studentSignals.includes("student_founders") ||
    investor.studentSignals.includes("young_founder_program")
  ) {
    return `${investor.firm} explicitly invests in student founders — lead with your student status and the problem you're solving when reaching out.`
  }

  // Priority 4: Twitter/social active
  if (investor.accessibilitySignals.includes("twitter_active")) {
    return `Engage with ${investor.name} on social media — comment thoughtfully on their posts before sending a cold email for a warmer intro.`
  }

  // Priority 5: Office hours available
  if (investor.accessibilitySignals.includes("office_hours")) {
    return `${investor.name} holds office hours — sign up for a slot and pitch your startup concisely in 3 minutes.`
  }

  // Priority 6: Focus-area specific generic
  const topFocus = investor.investmentFocus.slice(0, 2).join(" and ")
  return `Research ${investor.firm}'s recent investments in ${topFocus || "your sector"} and reference a specific portfolio company that complements your startup.`
}

// ─── Email Hint Generator ─────────────────────────────────────────────────────
// firstname@firmdomain.com — derived from catalog structured data.

export function generateEmailHint(investor: CatalogInvestor): string {
  if (!investor.firmDomain) {
    // Infer from firm name
    const slug = investor.firm
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20)
    return slug ? `firstname@${slug}.com` : ""
  }
  const firstName = investor.name.split(" ")[0].toLowerCase()
  return `${firstName}@${investor.firmDomain}`
}

// ─── Main Matching Function ───────────────────────────────────────────────────

export interface MatchedInvestor {
  investor: CatalogInvestor
  scores: ScoredProfile["scores"]
  overall_match: number
  engagement_likelihood: number
  contact_strategy: string
  email_hint: string
}

export function matchInvestors(
  keywords: string[],
  catalog: CatalogInvestor[],
  count: number
): MatchedInvestor[] {
  const scored: Array<MatchedInvestor & { _topicScore: number }> = []

  for (const investor of catalog) {
    const topic_match = scoreTopicMatchCatalog(investor, keywords)
    const student_collaboration = scoreStudentCollaborationCatalog(investor)
    const availability = scoreAvailabilityAndCheckSize(investor)
    const experience_level = scoreExperienceLevelCatalog(investor)
    const trend_alignment = scoreTrendAndStageFit(investor, topic_match)

    const scores: ScoredProfile["scores"] = {
      topic_match,
      student_collaboration,
      availability,
      experience_level,
      trend_alignment,
    }

    const overall_match = computeOverallMatchCatalog(scores)
    const engagement_likelihood = computeEngagementLikelihood(investor, topic_match)
    const contact_strategy = generateContactStrategy(investor, keywords)
    const email_hint = generateEmailHint(investor)

    scored.push({
      investor,
      scores,
      overall_match,
      engagement_likelihood,
      contact_strategy,
      email_hint,
      _topicScore: topic_match,
    })
  }

  // Sort: primary = overall_match desc, tiebreak = student_collaboration desc
  scored.sort((a, b) => {
    if (b.overall_match !== a.overall_match) return b.overall_match - a.overall_match
    return b.scores.student_collaboration - a.scores.student_collaboration
  })

  return scored.slice(0, Math.max(count, 3)).map(({ _topicScore: _, ...rest }) => rest)
}

// ─── Convert to ScoredProfile ─────────────────────────────────────────────────

export function catalogInvestorToScoredProfile(
  matched: MatchedInvestor
): ScoredProfile {
  const { investor, scores, overall_match, engagement_likelihood, contact_strategy, email_hint } = matched

  return {
    name: investor.name,
    title: investor.title,
    institution: investor.firm,
    department: investor.location,
    type: "investor",
    profile_tier: investor.tier,
    research_focus: investor.investmentFocus.join(", "),
    evidence_of_student_work: investor.studentFriendly
      ? `Actively invests in student founders. Focus: ${investor.investmentFocus.slice(0, 3).join(", ")}`
      : `Investment focus: ${investor.investmentFocus.slice(0, 3).join(", ")}`,
    scores,
    overall_match,
    engagement_likelihood,
    years_experience: Math.max(1, Math.floor(investor.investmentCount / 10)),
    active_projects: investor.investmentCount,
    contact_strategy,
    email_hint,
  }
}
