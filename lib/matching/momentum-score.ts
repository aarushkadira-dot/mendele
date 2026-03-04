/**
 * MOMENTUM SCORE — Proprietary Student Growth Index
 *
 * A deterministic composite index (0–100) that quantifies a student's
 * rate of growth across five dimensions. Measures VELOCITY, not position.
 *
 *   Score = AV + LP + AD + DF + EC
 *
 *   AV — Activity Velocity    (0–25): How rapidly new activities are being added
 *   LP — Level Progression    (0–25): Are activities escalating in prestige/tier?
 *   AD — Achievement Density  (0–20): Ratio of formal recognitions to activities
 *   DF — Domain Focus Score   (0–20): Coherence of activities (focused vs scattered)
 *   EC — Engagement Consistency (0–10): Profile health + platform activity
 *
 * Unlike the STAR score (which matches students to opportunities based on
 * current fit), the Momentum Score measures whether a student is accelerating
 * or stagnating — answering: "Who is this student *becoming*?"
 */

import { createClient } from "@/lib/supabase/server"
import {
  embedBatch,
  vectorAverage,
  cosineSimilarity,
} from "./embeddings"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MomentumComponents {
  activity_velocity: number     // 0–25
  level_progression: number     // 0–25
  achievement_density: number   // 0–20
  domain_focus: number          // 0–20
  engagement_consistency: number // 0–10
}

export interface MomentumBreakdown {
  total: number
  components: MomentumComponents
  grade: "A" | "B" | "C" | "D" | "N/A"
  insights: string[]
  improvement_tips: string[]
  percentile: number | null   // null until enough users exist
  computed_at: string
}

interface ExtracurricularRow {
  title: string
  organization: string | null
  type: string | null
  description: string | null
  created_at: string
}

interface AchievementRow {
  title: string
  category: string | null
  created_at: string
}

interface UserRow {
  name: string | null
  bio: string | null
  skills: string[] | null
  interests: string[] | null
}

interface ActivityRow {
  created_at: string
}

// ─── Tier Detection ───────────────────────────────────────────────────────────

/**
 * Classify an extracurricular into an engagement tier (1–4) based on keywords.
 *   4 = Winner/Finalist (highest competitive recognition)
 *   3 = Leader/Founder (significant leadership responsibility)
 *   2 = Contributor/Researcher (meaningful contribution)
 *   1 = Participant/Member (baseline involvement)
 */
function detectTier(title: string, type: string | null): number {
  const text = `${title} ${type ?? ""}`.toLowerCase()

  if (
    /\b(finalist|winner|1st place|olympiad|champion|gold medal|silver medal|bronze medal|award|prize|honored|top \d|rank|scholar|fellow)\b/.test(
      text
    )
  ) {
    return 4
  }
  if (
    /\b(president|founder|co-founder|director|captain|lead|head|chief|ceo|cto|coo|officer|chairman)\b/.test(
      text
    )
  ) {
    return 3
  }
  if (
    /\b(researcher|mentor|coordinator|organizer|editor|manager|developer|engineer|designer|analyst|author|contributor|published)\b/.test(
      text
    )
  ) {
    return 2
  }
  return 1
}

// ─── Component Computations ───────────────────────────────────────────────────

/**
 * AV — Activity Velocity (0–25)
 * Uses exponential decay so recent activities count more.
 * base_weight: 4.0 (tier 4), 3.0 (tier 3), 2.0 (tier 2), 1.5 (tier 1)
 * decay: e^(-0.08 × days_since_created)
 */
function computeActivityVelocity(ecs: ExtracurricularRow[]): number {
  if (ecs.length === 0) return 0

  const now = Date.now()
  let av = 0

  for (const ec of ecs) {
    const tier = detectTier(ec.title, ec.type)
    const baseWeight = tier === 4 ? 4.0 : tier === 3 ? 3.0 : tier === 2 ? 2.0 : 1.5
    const days = Math.max(0, (now - new Date(ec.created_at).getTime()) / (1000 * 86_400))
    av += baseWeight * Math.exp(-0.08 * days)
  }

  return Math.min(25, Math.round(av * 100) / 100)
}

/**
 * LP — Level Progression (0–25)
 * Compares average tier of earliest 1–3 activities vs most recent 1–3.
 * A student climbing from participant (1) → winner (4) scores near 25.
 */
function computeLevelProgression(ecs: ExtracurricularRow[]): number {
  if (ecs.length === 0) return 12.5 // neutral mid-point for empty profile

  // Sort oldest → newest
  const sorted = [...ecs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const tiers = sorted.map((e) => detectTier(e.title, e.type))
  const window = Math.min(3, tiers.length)

  const earlyTiers = tiers.slice(0, window)
  const recentTiers = tiers.slice(-window)

  const vEarly = earlyTiers.reduce((s, v) => s + v, 0) / earlyTiers.length
  const vRecent = recentTiers.reduce((s, v) => s + v, 0) / recentTiers.length

  // Formula: maps range (-3 to +3) → 0–25
  const lp = ((vRecent - vEarly + 3) / 6) * 25
  return Math.max(0, Math.min(25, Math.round(lp * 100) / 100))
}

/**
 * AD — Achievement Density (0–20)
 * Measures the conversion rate of activities → formal recognition.
 * Uses tanh to reward high density with diminishing returns.
 */
function computeAchievementDensity(
  achievementCount: number,
  extracurricularCount: number
): number {
  const ratio = achievementCount / Math.max(extracurricularCount * 0.5, 1)
  const ad = Math.tanh(ratio) * 20
  return Math.max(0, Math.min(20, Math.round(ad * 100) / 100))
}

/**
 * DF — Domain Focus Score (0–20)
 * Measures coherence of activities using embedding centroid similarity.
 * Falls back to neutral 10 if embeddings are unavailable (no credentials).
 */
async function computeDomainFocus(ecs: ExtracurricularRow[]): Promise<number> {
  if (ecs.length <= 1) return 10 // neutral — not enough data to judge focus

  const texts = ecs.map(
    (e) => `${e.title} at ${e.organization ?? ""}${e.description ? ": " + e.description : ""}`
  )

  try {
    const embeddings = await embedBatch(texts, "RETRIEVAL_DOCUMENT")
    if (embeddings.length < 2) return 10

    const centroid = vectorAverage(embeddings)
    const similarities = embeddings.map((emb) => cosineSimilarity(emb, centroid))
    const avgCoherence =
      similarities.reduce((s, v) => s + v, 0) / similarities.length

    // Map: coherence 0.30 → 0 pts, coherence 0.75 → 20 pts
    const df = ((avgCoherence - 0.3) / 0.45) * 20
    return Math.max(0, Math.min(20, Math.round(df * 100) / 100))
  } catch {
    return 10 // graceful fallback if embedding API is unavailable
  }
}

/**
 * EC — Engagement Consistency (0–10)
 * Composite of profile completeness and recent platform activity.
 */
function computeEngagementConsistency(
  user: UserRow,
  projectCount: number,
  achievementCount: number,
  recentActivityCount: number
): number {
  const completenessScore =
    ((user.name ? 1 : 0) +
      (user.bio ? 1 : 0) +
      ((user.skills?.length ?? 0) >= 3 ? 1 : 0) +
      ((user.interests?.length ?? 0) >= 2 ? 1 : 0) +
      (projectCount >= 1 ? 1 : 0) +
      (achievementCount >= 1 ? 1 : 0)) /
    6

  const activitySignal = Math.min(1.0, recentActivityCount / 5)
  const ec = (completenessScore * 0.7 + activitySignal * 0.3) * 10
  return Math.max(0, Math.min(10, Math.round(ec * 100) / 100))
}

// ─── Insight Generation ───────────────────────────────────────────────────────

function generateInsights(
  components: MomentumComponents,
  ecCount: number,
  achievementCount: number
): { insights: string[]; tips: string[] } {
  const insights: string[] = []
  const tips: string[] = []

  const { activity_velocity, level_progression, achievement_density, domain_focus } = components

  // ── Insights (what's going well)
  if (activity_velocity >= 18) {
    insights.push("You're adding activities at a strong pace — your momentum is building fast.")
  } else if (activity_velocity >= 10) {
    insights.push("Steady activity cadence detected. Keep engaging to accelerate your score.")
  }

  if (level_progression >= 18) {
    insights.push("Your engagement level is escalating — you're trending toward competitive and leadership roles.")
  } else if (level_progression >= 12 && ecCount >= 2) {
    insights.push("You're progressing through engagement tiers. One more leadership role would push your score higher.")
  }

  if (domain_focus >= 15) {
    insights.push("Strong domain focus detected — you're building deep, recognized expertise in a specific field.")
  }

  if (achievement_density >= 14) {
    insights.push("Excellent achievement density — your activities are consistently converting to formal recognition.")
  }

  // Fallback for very new users
  if (ecCount === 0) {
    insights.push("Add your first extracurricular to start calculating your momentum trajectory.")
  }

  // ── Tips (what to improve) — prioritize the 3 lowest components
  const componentList: [string, number, number][] = [
    ["activity_velocity", activity_velocity, 25],
    ["level_progression", level_progression, 25],
    ["achievement_density", achievement_density, 20],
    ["domain_focus", domain_focus, 20],
    ["engagement_consistency", components.engagement_consistency, 10],
  ]
  componentList.sort((a, b) => a[1] / a[2] - b[1] / b[2]) // sort by pct, lowest first

  const tipMap: Record<string, string> = {
    activity_velocity:
      "Add extracurriculars or update existing ones to boost your Activity Velocity score.",
    level_progression:
      "Aim for leadership or competitive roles (e.g., club president, competition finalist) to increase Level Progression.",
    achievement_density: achievementCount === 0
      ? "Log your first achievement (award, recognition, or publication) to start your Achievement Density score."
      : "Convert more of your activities into formal achievements — competitions, publications, or awards count.",
    domain_focus:
      "Focus your next 1–2 activities in your primary domain to strengthen your Domain Focus score.",
    engagement_consistency:
      "Complete your profile (bio, skills, interests) and log in regularly to improve Engagement Consistency.",
  }

  for (const [key] of componentList.slice(0, 3)) {
    if (tipMap[key]) tips.push(tipMap[key])
  }

  return {
    insights: insights.slice(0, 2),
    tips: tips.slice(0, 3),
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Compute the full Momentum Score breakdown for a given user.
 * Fetches all required data from Supabase and runs the 5-component formula.
 */
export async function computeMomentumScore(userId: string): Promise<MomentumBreakdown> {
  const supabase = await createClient()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()

  // Parallel fetch of all required data
  const [
    userResult,
    ecsResult,
    achievementsResult,
    projectsResult,
    recentActivityResult,
  ] = await Promise.all([
    (supabase.from("users") as any)
      .select("name, bio, skills, interests")
      .eq("id", userId)
      .single(),
    (supabase.from("extracurriculars") as any)
      .select("title, organization, type, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    (supabase.from("achievements") as any)
      .select("title, category, created_at")
      .eq("user_id", userId),
    (supabase.from("projects") as any)
      .select("id")
      .eq("owner_id", userId)
      .eq("status", "completed")
      .limit(1),
    (supabase.from("user_activities") as any)
      .select("created_at")
      .eq("user_id", userId)
      .gte("date", fourteenDaysAgo),
  ])

  const user: UserRow = userResult.data ?? { name: null, bio: null, skills: null, interests: null }
  const ecs: ExtracurricularRow[] = ecsResult.data ?? []
  const achievements: AchievementRow[] = achievementsResult.data ?? []
  const projectCount: number = (projectsResult.data ?? []).length
  const recentActivities: ActivityRow[] = recentActivityResult.data ?? []

  // ── Component computations (DF is async due to embedding call)
  const av = computeActivityVelocity(ecs)
  const lp = computeLevelProgression(ecs)
  const ad = computeAchievementDensity(achievements.length, ecs.length)
  const df = await computeDomainFocus(ecs)
  const ec = computeEngagementConsistency(user, projectCount, achievements.length, recentActivities.length)

  // ── Total score
  const raw = av + lp + ad + df + ec
  const total = Math.max(0, Math.min(100, Math.round(raw)))

  // ── Letter grade
  const grade: MomentumBreakdown["grade"] =
    total === 0 && ecs.length === 0
      ? "N/A"
      : total >= 80
      ? "A"
      : total >= 60
      ? "B"
      : total >= 40
      ? "C"
      : "D"

  const components: MomentumComponents = {
    activity_velocity: av,
    level_progression: lp,
    achievement_density: ad,
    domain_focus: df,
    engagement_consistency: ec,
  }

  const { insights, tips } = generateInsights(components, ecs.length, achievements.length)

  return {
    total,
    components,
    grade,
    insights,
    improvement_tips: tips,
    percentile: null, // populated by background job once platform has 50+ users
    computed_at: new Date().toISOString(),
  }
}
