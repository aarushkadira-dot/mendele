/**
 * STAR Engine — Trajectory Velocity Scoring
 *
 * Analyzes the student's extracurricular history to detect growth direction
 * and recommend "next-level" opportunities. Calculates a Growth Vector:
 *
 *   G = V_current − V_baseline
 *
 * Where V_baseline is the embedding centroid of earliest activities and
 * V_current is the centroid of most recent activities. Opportunities that
 * align with G (the direction of growth) get the trajectory boost.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
  embedText,
  embedBatch,
  vectorAverage,
  vectorSubtract,
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
} from "./embeddings"

// ─── Types ────────────────────────────────────────────────────────────────────

export type EngagementLevel = "participant" | "contributor" | "leader" | "competitor"

export interface TrajectoryProfile {
  /** The student's growth vector: V_current - V_baseline (null if < 2 activities) */
  growthVector: Float32Array | null
  /** Highest engagement level the student has reached */
  peakLevel: EngagementLevel
  /** Primary domain concentration (e.g., "STEM", "Arts") */
  primaryDomain: string | null
  /** Domains the student has achievements in */
  achievementDomains: Set<string>
  /** Number of extracurriculars */
  activityCount: number
  /** Recommended next opportunity types based on current level */
  nextLevelTypes: string[]
}

interface Extracurricular {
  title: string
  organization: string
  type: string
  start_date: string
  end_date: string
  description: string | null
}

interface Achievement {
  title: string
  category: string
  description: string | null
  date: string
}

interface OpportunityForScoring {
  title?: string | null
  type?: string | null
  category?: string | null
  description?: string | null
}

// ─── Domain Classification ────────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  STEM: [
    "science", "technology", "engineering", "math", "computer", "programming",
    "coding", "robotics", "physics", "chemistry", "biology", "data", "ai",
    "machine learning", "algorithm", "research", "lab", "experiment", "stem",
    "aerospace", "biotech", "quantum", "software", "hardware", "cyber",
    "neural", "genome", "calculus", "statistics", "python", "java",
  ],
  Arts: [
    "art", "music", "theater", "theatre", "dance", "film", "photography",
    "design", "creative", "painting", "sculpture", "drawing", "animation",
    "choir", "orchestra", "band", "drama", "visual", "performing",
    "ceramics", "poetry", "writing", "literary", "fiction",
  ],
  Business: [
    "business", "entrepreneurship", "finance", "economics", "marketing",
    "startup", "investment", "accounting", "management", "consulting",
    "venture", "commerce", "trade", "leadership", "strategy", "stock",
    "nonprofit", "social enterprise", "deca", "fbla",
  ],
  "Social Science": [
    "social", "psychology", "sociology", "political", "government", "law",
    "history", "debate", "model un", "mun", "public policy", "philosophy",
    "anthropology", "international relations", "civics", "justice",
  ],
  Health: [
    "health", "medical", "medicine", "nursing", "pharmacy", "dental",
    "hospital", "clinical", "patient", "anatomy", "physiology", "nutrition",
    "mental health", "therapy", "public health", "pre-med", "biomedical",
  ],
  Humanities: [
    "english", "literature", "language", "foreign", "spanish", "french",
    "mandarin", "journalism", "communication", "media", "religion",
    "ethics", "classics", "cultural", "linguistics",
  ],
  Community: [
    "community", "volunteer", "service", "charity", "outreach", "mentor",
    "tutor", "civic", "environmental", "sustainability", "climate",
    "conservation", "habitat", "food bank", "shelter",
  ],
}

/**
 * Classify text into a domain based on keyword matching.
 */
export function classifyDomain(text: string): string {
  const lower = text.toLowerCase()
  const scores: Record<string, number> = {}

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let count = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) count++
    }
    if (count > 0) scores[domain] = count
  }

  if (Object.keys(scores).length === 0) return "General"

  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
}

// ─── Engagement Level Classification ──────────────────────────────────────────

const LEVEL_KEYWORDS: Record<EngagementLevel, string[]> = {
  competitor: [
    "finalist", "winner", "champion", "qualifier", "national", "international",
    "olympiad", "competition", "contest", "award", "gold", "silver", "bronze",
    "semifinalist", "medalist", "1st place", "2nd place", "3rd place",
  ],
  leader: [
    "president", "captain", "lead", "founder", "executive", "director",
    "head", "chief", "chair", "coordinator", "officer", "vp",
    "vice president", "co-founder", "editor-in-chief", "manager",
  ],
  contributor: [
    "volunteer", "tutor", "mentor", "instructor", "teaching assistant",
    "researcher", "intern", "contributor", "ambassador", "advocate",
  ],
  participant: [
    "member", "participant", "attendee", "student", "learner", "club",
  ],
}

/**
 * Classify an activity's engagement level based on title/description keywords.
 */
export function classifyLevel(title: string, description?: string | null): EngagementLevel {
  const text = `${title} ${description || ""}`.toLowerCase()

  // Check in order of highest level first
  const levels: EngagementLevel[] = ["competitor", "leader", "contributor", "participant"]
  for (const level of levels) {
    for (const kw of LEVEL_KEYWORDS[level]) {
      if (text.includes(kw)) return level
    }
  }

  return "participant"
}

// ─── Level-Up Logic ───────────────────────────────────────────────────────────

const LEVEL_UP_TYPES: Record<EngagementLevel, string[]> = {
  participant: ["club", "workshop", "course", "program", "camp"],
  contributor: ["competition", "fellowship", "leadership program", "research"],
  leader: ["internship", "research", "national competition", "fellowship", "startup"],
  competitor: ["internship", "research program", "mentorship", "scholarship", "fellowship"],
}

/**
 * Get recommended next opportunity types based on the student's current engagement level.
 */
function getNextLevelTypes(currentLevel: EngagementLevel): string[] {
  return LEVEL_UP_TYPES[currentLevel]
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

/**
 * Fetch extracurriculars and achievements, build a TrajectoryProfile
 * including the Growth Vector G = V_current - V_baseline.
 */
export async function getTrajectorySignals(userId: string): Promise<TrajectoryProfile> {
  const supabase = createAdminClient()

  // Fetch extracurriculars and achievements in parallel
  const [ecResult, achResult] = await Promise.all([
    supabase
      .from("extracurriculars")
      .select("title, organization, type, start_date, end_date, description")
      .eq("user_id", userId)
      .order("start_date", { ascending: true }),
    supabase
      .from("achievements")
      .select("title, category, description, date")
      .eq("user_id", userId)
      .order("date", { ascending: true }),
  ])

  const extracurriculars = (ecResult.data as Extracurricular[] | null) || []
  const achievements = (achResult.data as Achievement[] | null) || []

  // No activities — return baseline
  if (extracurriculars.length === 0 && achievements.length === 0) {
    return {
      growthVector: null,
      peakLevel: "participant",
      primaryDomain: null,
      achievementDomains: new Set(),
      activityCount: 0,
      nextLevelTypes: getNextLevelTypes("participant"),
    }
  }

  // ── Classify engagement level ──
  let peakLevel: EngagementLevel = "participant"
  const levelOrder: EngagementLevel[] = ["participant", "contributor", "leader", "competitor"]

  for (const ec of extracurriculars) {
    const level = classifyLevel(ec.title, ec.description)
    if (levelOrder.indexOf(level) > levelOrder.indexOf(peakLevel)) {
      peakLevel = level
    }
  }

  for (const ach of achievements) {
    const level = classifyLevel(ach.title, ach.description)
    if (levelOrder.indexOf(level) > levelOrder.indexOf(peakLevel)) {
      peakLevel = level
    }
  }

  // ── Classify domains ──
  const domainCounts: Record<string, number> = {}
  for (const ec of extracurriculars) {
    const domain = classifyDomain(`${ec.title} ${ec.organization} ${ec.type} ${ec.description || ""}`)
    domainCounts[domain] = (domainCounts[domain] || 0) + 1
  }

  const primaryDomain = Object.keys(domainCounts).length > 0
    ? Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null

  // ── Achievement domains ──
  const achievementDomains = new Set<string>()
  for (const ach of achievements) {
    const domain = classifyDomain(`${ach.title} ${ach.category} ${ach.description || ""}`)
    achievementDomains.add(domain)
  }

  // ── Growth Vector ──
  let growthVector: Float32Array | null = null

  if (extracurriculars.length >= 2) {
    try {
      // Split into baseline (earliest) and current (most recent)
      const baselineECs = extracurriculars.slice(0, Math.min(3, Math.floor(extracurriculars.length / 2)))
      const currentECs = extracurriculars.slice(-Math.min(3, Math.ceil(extracurriculars.length / 2)))

      const baselineTexts = baselineECs.map(
        (ec) => `${ec.title} at ${ec.organization}: ${ec.description || ec.type}`
      )
      const currentTexts = currentECs.map(
        (ec) => `${ec.title} at ${ec.organization}: ${ec.description || ec.type}`
      )

      // Embed baseline and current activity sets
      const [baselineVectors, currentVectors] = await Promise.all([
        embedBatch(baselineTexts, "RETRIEVAL_DOCUMENT"),
        embedBatch(currentTexts, "RETRIEVAL_DOCUMENT"),
      ])

      const baselineCentroid = vectorAverage(baselineVectors)
      const currentCentroid = vectorAverage(currentVectors)

      // G = V_current - V_baseline
      growthVector = vectorSubtract(currentCentroid, baselineCentroid)
    } catch (err) {
      console.warn("[Trajectory] Failed to compute growth vector:", err)
      // Growth vector stays null — graceful degradation
    }
  }

  return {
    growthVector,
    peakLevel,
    primaryDomain,
    achievementDomains,
    activityCount: extracurriculars.length,
    nextLevelTypes: getNextLevelTypes(peakLevel),
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score an opportunity based on the student's trajectory.
 * Returns 0–15 with descriptive reasons.
 *
 * +8 if opportunity aligns with growth vector direction
 * +4 if opportunity matches "next level" for this student
 * +3 if student has achievements in same domain
 *
 * New users (no extracurriculars): baseline 7
 */
export function scoreTrajectory(
  opp: OpportunityForScoring,
  trajectory: TrajectoryProfile,
  oppEmbedding?: Float32Array | null
): { score: number; reasons: string[] } {
  // No activity history — neutral baseline
  if (trajectory.activityCount === 0) {
    return { score: 7, reasons: [] }
  }

  let score = 0
  const reasons: string[] = []

  const oppText = `${opp.title || ""} ${opp.category || ""} ${opp.type || ""} ${opp.description || ""}`.toLowerCase()
  const oppDomain = classifyDomain(oppText)

  // ── Growth vector alignment (+0–8) ──
  if (trajectory.growthVector && oppEmbedding) {
    const alignment = cosineSimilarity(trajectory.growthVector, oppEmbedding)
    if (alignment > 0.3) {
      score += 8
      reasons.push(`Aligns with your growth trajectory in ${trajectory.primaryDomain || "your field"}`)
    } else if (alignment > 0.15) {
      score += 4
      reasons.push("Matches your development direction")
    }
  } else if (trajectory.primaryDomain && oppDomain === trajectory.primaryDomain) {
    // Fallback: domain match without growth vector
    score += 5
    reasons.push(`Matches your focus area: ${trajectory.primaryDomain}`)
  }

  // ── Level-up recommendation (+0–4) ──
  const oppType = (opp.type || "").toLowerCase()
  const oppTitle = (opp.title || "").toLowerCase()
  const levelUpMatch = trajectory.nextLevelTypes.some(
    (t) => oppType.includes(t) || oppTitle.includes(t) || oppText.includes(t)
  )
  if (levelUpMatch) {
    score += 4
    const levelNames: Record<EngagementLevel, string> = {
      participant: "active involvement",
      contributor: "leadership and competition",
      leader: "advanced research and internships",
      competitor: "mentorship and scholarships",
    }
    reasons.push(`Next step in your journey — ${levelNames[trajectory.peakLevel]}`)
  }

  // ── Achievement domain validation (+0–3) ──
  if (trajectory.achievementDomains.has(oppDomain)) {
    score += 3
    reasons.push("Builds on a domain where you've earned recognition")
  }

  return {
    score: Math.min(15, score),
    reasons,
  }
}
