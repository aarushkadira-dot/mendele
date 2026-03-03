/**
 * STAR Engine — Orchestrator
 *
 * Combines four scoring signals into a final match score:
 *
 *   S_final = (S_sem × 0.4) + (S_prac × 0.25) + (S_beh × 0.2) + (S_traj × 0.15)
 *
 * Signals:
 *   - Semantic Match (40%): Cosine similarity via text-embedding-004
 *   - Practical Fit (25%): Grade level + type preference + availability/location
 *   - Behavioral Bias (20%): Bayesian feedback from save/dismiss/apply history
 *   - Trajectory Velocity (15%): Growth Vector G = V_current − V_baseline
 *
 * Falls back to legacy keyword scoring if embedding API is unavailable.
 */

import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Opportunity } from "@/lib/types"
import {
  embedText,
  buildStudentEmbeddingText,
  cosineSimilarity,
  vectorFromArray,
} from "./embeddings"
import { getBehavioralSignals, scoreBehavioral, type BehavioralProfile } from "./behavioral"
import { getTrajectorySignals, scoreTrajectory, type TrajectoryProfile } from "./trajectory"

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  interests: string[]
  career_goals: string | null
  preferred_opportunity_types: string[]
  academic_strengths: string[]
  grade_level: number | null
  location: string | null
  availability: string | null
}

interface MatchResult {
  score: number
  reasons: string[]
}

interface OpportunityWithEmbedding {
  opportunity: Opportunity
  embedding: Float32Array | null
}

// ─── Semantic Score Mapping ───────────────────────────────────────────────────

/**
 * Map cosine similarity to a 0–40 score with linear interpolation within bands.
 */
function semanticScore(similarity: number): number {
  if (similarity >= 0.85) return 40
  if (similarity >= 0.70) return 32 + ((similarity - 0.70) / 0.15) * 8
  if (similarity >= 0.55) return 24 + ((similarity - 0.55) / 0.15) * 8
  if (similarity >= 0.40) return 16 + ((similarity - 0.40) / 0.15) * 8
  if (similarity >= 0.25) return 8 + ((similarity - 0.25) / 0.15) * 8
  return Math.max(0, similarity * 32) // Linear below 0.25
}

// ─── Practical Fit Scoring ────────────────────────────────────────────────────

/**
 * Score practical fit: grade level, type preference, location/remote.
 * Returns 0–25.
 */
function scorePracticalFit(
  opp: Opportunity,
  profile: UserProfile
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // ── Grade level (0–10) ──
  if (profile.grade_level && opp.grade_levels && opp.grade_levels.length > 0) {
    if (opp.grade_levels.includes(profile.grade_level)) {
      score += 10
      reasons.push("Available for your grade level")
    }
    // Mismatch = 0 points
  } else if (profile.grade_level && (!opp.grade_levels || opp.grade_levels.length === 0)) {
    // No grade restriction = open to all, partial bonus
    score += 5
  }

  // ── Type preference (0–10) ──
  if (profile.preferred_opportunity_types && profile.preferred_opportunity_types.length > 0) {
    const prefTypes = profile.preferred_opportunity_types.map((t) => t.toLowerCase())
    const oppType = (opp.type || "").toLowerCase()
    if (
      prefTypes.includes(oppType) ||
      prefTypes.some((t) => oppType.includes(t) || t.includes(oppType))
    ) {
      score += 10
      reasons.push(`Matches your preferred type: ${opp.type}`)
    }
  }

  // ── Location/Remote fit (0–5) ──
  if (opp.remote || opp.location_type === "Online") {
    score += 5
    reasons.push("Remote opportunity — accessible from anywhere")
  } else if (profile.location && opp.location) {
    // Simple location overlap check
    const profileLoc = profile.location.toLowerCase()
    const oppLoc = opp.location.toLowerCase()
    if (oppLoc.includes(profileLoc) || profileLoc.includes(oppLoc)) {
      score += 5
      reasons.push("Located near you")
    }
  }

  return { score: Math.min(25, score), reasons }
}

// ─── Main STAR Scoring ────────────────────────────────────────────────────────

/**
 * Score a single opportunity using all four STAR signals.
 *
 * S_final = (S_sem × 0.4) + (S_prac × 0.25) + (S_beh × 0.2) + (S_traj × 0.15)
 */
function scoreOpportunityStar(
  opp: Opportunity,
  similarity: number,
  profile: UserProfile,
  behavioralProfile: BehavioralProfile,
  trajectoryProfile: TrajectoryProfile,
  oppEmbedding?: Float32Array | null
): MatchResult {
  const reasons: string[] = []

  // ── 1. Semantic Match (0–40, weight 0.4) ──
  const semScore = semanticScore(similarity)
  if (semScore >= 24) {
    // Extract top interests for reason text
    const topInterests = (profile.interests || []).slice(0, 3).join(", ")
    if (topInterests) {
      reasons.push(
        semScore >= 32
          ? `Strong match with your interests in ${topInterests}`
          : `Related to your interests in ${topInterests}`
      )
    } else {
      reasons.push("Semantically aligned with your profile")
    }
  }

  // ── 2. Practical Fit (0–25, weight 0.25) ──
  const practical = scorePracticalFit(opp, profile)
  reasons.push(...practical.reasons)

  // ── 3. Behavioral Bias (0–20, weight 0.2) ──
  const behavioral = scoreBehavioral(opp, behavioralProfile)
  reasons.push(...behavioral.reasons)

  // ── 4. Trajectory Velocity (0–15, weight 0.15) ──
  const trajectory = scoreTrajectory(opp, trajectoryProfile, oppEmbedding)
  reasons.push(...trajectory.reasons)

  // ── Combine with weights ──
  // Each signal is already on its own scale (sem: 0-40, prac: 0-25, beh: 0-20, traj: 0-15)
  // They sum to max 100, so we just add them directly
  const rawScore = semScore + practical.score + behavioral.score + trajectory.score

  // ── Staleness penalty ──
  let penalty = 0
  if (!opp.last_verified) {
    penalty = 3
  } else {
    const daysSinceVerified = (Date.now() - new Date(opp.last_verified).getTime()) / 86400000
    if (daysSinceVerified > 30) penalty = 2
  }

  const finalScore = Math.max(0, Math.min(100, rawScore - penalty))

  return {
    score: finalScore,
    reasons: reasons.filter(Boolean).slice(0, 5), // Cap at 5 reasons
  }
}

// ─── High-School Relevance Filter ─────────────────────────────────────────────

function isHsRelevant(opp: { grade_levels?: number[] | null }): boolean {
  const grades = opp.grade_levels
  if (!grades || grades.length === 0) return true
  const hsGrades = new Set([9, 10, 11, 12])
  return grades.some((g) => hsGrades.has(g))
}

const ADULT_ONLY_TITLE_PATTERNS = [
  /\bpostdoc(?:toral)?\b/i,
  /\bphd\s+(position|internship|fellowship|candidate)\b/i,
  /\bdoctoral\s+(position|internship|fellowship)\b/i,
  /\bgraduate\s+internship\b/i,
  /\bundergraduate\s+internship\b/i,
  /\bcurrent\s+phd\b/i,
  /\bsenior\s+(software\s+)?(engineer|developer|manager|scientist|researcher)\b/i,
]

function isTitleHsAppropriate(title: string): boolean {
  return !ADULT_ONLY_TITLE_PATTERNS.some((p) => p.test(title))
}

// ─── Format Helper ────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function getRelativeTime(d: Date): string {
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Fetch opportunities personalized using the STAR Engine.
 * Falls back to empty results if profile is incomplete.
 *
 * Flow:
 * 1. Embed student profile (RETRIEVAL_QUERY)
 * 2. Fetch opportunity embeddings + behavioral + trajectory signals in parallel
 * 3. Compute cosine similarity for all opportunities
 * 4. Pre-filter by similarity threshold
 * 5. Score with full STAR formula
 * 6. Sort and return
 */
export async function getPersonalizedOpportunitiesStar(
  minScore: number = 20
): Promise<{
  opportunities: any[]
  profileComplete: boolean
}> {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  if (!authUser) {
    return { opportunities: [], profileComplete: false }
  }

  // ── Fetch user profile ──
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", authUser.id)
    .single()

  const profile = profileData as UserProfile | null

  if (
    !profile ||
    ((!profile.interests || profile.interests.length === 0) &&
      (!profile.career_goals || profile.career_goals.trim() === "") &&
      (!profile.preferred_opportunity_types || profile.preferred_opportunity_types.length === 0) &&
      (!profile.academic_strengths || profile.academic_strengths.length === 0))
  ) {
    return { opportunities: [], profileComplete: false }
  }

  // ── Fetch user's extracurriculars for embedding text ──
  const { data: ecData } = await supabase
    .from("extracurriculars")
    .select("title, organization, type, description")
    .eq("user_id", authUser.id)
    .limit(10)

  const extracurriculars = ecData || []

  // ── Build & embed student profile ──
  const studentText = buildStudentEmbeddingText(profile as any, extracurriculars as any)
  const studentVector = await embedText(studentText, "RETRIEVAL_QUERY")

  // ── Fetch data in parallel ──
  const adminClient = createAdminClient()

  const [embeddingsResult, opportunities, behavioralProfile, trajectoryProfile, userOppsResult] =
    await Promise.all([
      // All opportunity embeddings
      adminClient
        .from("opportunity_embeddings")
        .select("opportunity_id, embedding"),

      // All active opportunities
      supabase
        .from("opportunities")
        .select("*")
        .eq("is_active", true)
        .neq("title", "Unknown")
        .neq("title", "")
        .order("created_at", { ascending: false })
        .limit(5000),

      // Behavioral signals
      getBehavioralSignals(authUser.id),

      // Trajectory signals
      getTrajectorySignals(authUser.id),

      // User's saved/dismissed status
      supabase
        .from("user_opportunities")
        .select("opportunity_id, match_score, match_reasons, status")
        .eq("user_id", authUser.id),
    ])

  const rawOpportunities = (opportunities.data as Opportunity[] | null) || []

  // ── Build embedding lookup map ──
  const embeddingMap = new Map<string, Float32Array>()
  if (embeddingsResult.data) {
    for (const row of embeddingsResult.data) {
      if (row.embedding) {
        embeddingMap.set(row.opportunity_id, vectorFromArray(row.embedding as number[]))
      }
    }
  }

  // ── HS relevance filter + dedup ──
  const seenTitles = new Set<string>()
  const filteredOpps = rawOpportunities.filter((opp) => {
    if (!isHsRelevant(opp)) return false
    if (!isTitleHsAppropriate(opp.title)) return false
    const key = opp.title.trim().toLowerCase()
    if (!key || seenTitles.has(key)) return false
    seenTitles.add(key)
    return true
  })

  // ── Compute cosine similarity for all opportunities ──
  const scoredOpps: Array<{
    opp: Opportunity
    similarity: number
    oppEmbedding: Float32Array | null
  }> = []

  for (const opp of filteredOpps) {
    const oppEmbedding = embeddingMap.get(opp.id) || null
    let similarity = 0

    if (oppEmbedding) {
      similarity = cosineSimilarity(studentVector, oppEmbedding)
    }

    // Pre-filter: skip very low similarity (or no embedding)
    // But keep opportunities without embeddings (they'll score on other signals)
    if (oppEmbedding && similarity < 0.15) continue

    scoredOpps.push({ opp, similarity, oppEmbedding })
  }

  // ── Full STAR scoring ──
  const userOpps = (userOppsResult.data || []).reduce(
    (acc: Record<string, any>, uo: any) => {
      acc[uo.opportunity_id] = {
        match_score: uo.match_score,
        match_reasons: uo.match_reasons,
        status: uo.status,
      }
      return acc
    },
    {} as Record<string, { match_score: number; match_reasons: unknown; status: string }>
  )

  const results = scoredOpps
    .map(({ opp, similarity, oppEmbedding }) => {
      const { score, reasons } = scoreOpportunityStar(
        opp,
        similarity,
        profile,
        behavioralProfile,
        trajectoryProfile,
        oppEmbedding
      )
      return { opp, score, reasons }
    })
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)

  // ── Format for frontend ──
  const formatted = results.map(({ opp, score, reasons }) => {
    const userOpp = userOpps[opp.id]
    return {
      id: opp.id,
      url: opp.url,
      title: opp.title,
      company: opp.company,
      location: opp.location,
      type: opp.type,
      category: opp.category,
      suggestedCategory: opp.suggested_category,
      gradeLevels: opp.grade_levels,
      locationType: opp.location_type,
      startDate: opp.start_date,
      endDate: opp.end_date,
      cost: opp.cost,
      timeCommitment: opp.time_commitment,
      prizes: opp.prizes,
      contactEmail: opp.contact_email,
      applicationUrl: opp.application_url,
      matchScore: score,
      matchReasons: reasons,
      deadline: opp.deadline ? formatDate(new Date(opp.deadline)) : null,
      postedDate: getRelativeTime(new Date(opp.posted_date)),
      logo: opp.logo,
      skills: opp.skills,
      description: opp.description,
      salary: opp.salary,
      duration: opp.duration,
      remote: opp.remote,
      applicants: opp.applicants,
      requirements: opp.requirements,
      sourceUrl: opp.source_url,
      timingType: opp.timing_type,
      extractionConfidence: opp.extraction_confidence,
      isActive: opp.is_active,
      isExpired: opp.is_expired,
      lastVerified: opp.last_verified,
      recheckAt: opp.recheck_at,
      nextCycleExpected: opp.next_cycle_expected,
      dateDiscovered: opp.date_discovered,
      createdAt: opp.created_at,
      updatedAt: opp.updated_at,
      status: userOpp?.status || null,
      saved: userOpp?.status === "saved",
    }
  })

  return { opportunities: formatted, profileComplete: true }
}
