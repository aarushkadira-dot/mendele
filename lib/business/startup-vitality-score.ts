/**
 * STARTUP VITALITY SCORE — Proprietary Investor-Readiness Index
 *
 * A deterministic composite index (0–100) measuring how investor-ready
 * a student startup profile is. Computed from existing project data — no
 * AI calls required, runs in <10ms.
 *
 *   SVS = MC + TS + CS + SS + UC (clamped 0–100)
 *
 *   MC — Market Clarity      (0–25): Keyword density of market/monetization signals
 *   TS — Team Strength       (0–20): Team size + role diversity
 *   CS — Content Signals     (0–20): Pitch deck, website, LinkedIn presence
 *   SS — Stage Score         (0–25): How far along is the startup?
 *   UC — Update Currency     (0–10): Is the founder actively working?
 */

import type { Project, ProjectLink } from "@/lib/projects"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SVSComponents {
  market_clarity: number        // 0–25
  team_strength: number         // 0–20
  content_signals: number       // 0–20
  stage_score: number           // 0–25
  update_currency: number       // 0–10
}

export interface StartupVitalityScore {
  total: number
  grade: "A" | "B" | "C" | "D" | "N/A"
  components: SVSComponents
  insights: string[]
  improvement_tips: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKET_SIGNALS = [
  "market", "revenue", "monetize", "monetization", "customers", "users",
  "b2b", "b2c", "saas", "subscription", "enterprise", "consumer", "target",
  "segment", "tam", "problem", "solution", "pain point", "billion", "million",
  "growth", "scale", "profit", "business model", "pricing", "sales",
  "traction", "retention", "acquisition", "churn", "ltv", "cac", "mrr", "arr",
]

const GRADE_CONFIG: Record<string, { label: string }> = {
  A: { label: "Investor Ready" },
  B: { label: "Fundable" },
  C: { label: "Early Stage" },
  D: { label: "Idea Phase" },
  "N/A": { label: "No Startup" },
}

// ─── Component Computations ───────────────────────────────────────────────────

/**
 * MC — Market Clarity (0–25)
 * Keyword density scoring on description + title.
 */
function computeMarketClarity(project: Project): number {
  const text = `${project.title} ${project.description}`.toLowerCase()
  let hits = 0
  for (const signal of MARKET_SIGNALS) {
    if (text.includes(signal)) hits++
  }
  const mc = (Math.min(hits, 8) / 8) * 25
  return Math.round(mc * 100) / 100
}

/**
 * TS — Team Strength (0–20)
 * Team size + role diversity bonus.
 */
function computeTeamStrength(project: Project): number {
  const teamSize = (project.collaborators?.length ?? 0) + 1 // +1 for owner
  let ts = teamSize === 1 ? 5 : teamSize === 2 ? 12 : teamSize === 3 ? 17 : 20

  // Role diversity bonus (+3 capped at 20)
  const roles = (project.collaborators || []).map((c) => c.role.toLowerCase())
  const hasTech = roles.some((r) =>
    /technical|engineer|developer|cto|tech|code|software/.test(r)
  )
  const hasBusiness = roles.some((r) =>
    /business|marketing|sales|growth|cmo|coo|operations|strategy/.test(r)
  )
  if (hasTech && hasBusiness) ts = Math.min(20, ts + 3)

  return ts
}

/**
 * CS — Content Signals (0–20)
 * Pitch deck (10 pts), website (6 pts), LinkedIn (4 pts).
 */
function computeContentSignals(project: Project): number {
  const links: ProjectLink[] = project.links || []
  const hasPitch = links.some((l) => l.type === "pitch") ? 10 : 0
  const hasWebsite = links.some((l) => l.type === "website") ? 6 : 0
  const hasLinkedIn = links.some((l) => l.type === "linkedin") ? 4 : 0
  return Math.min(20, hasPitch + hasWebsite + hasLinkedIn)
}

/**
 * SS — Stage Score (0–25)
 * Maps project status + description keywords to a stage score.
 */
function computeStageScore(project: Project): number {
  let base = 0

  const status = (project.status || "").toLowerCase()
  if (status === "completed") base = 25
  else if (status === "active" || status === "in_progress") base = 17
  else if (status === "in progress") base = 17
  else if (status === "prototype") base = 10
  else base = 5 // planning / idea

  // Description keyword bonus
  const desc = (project.description || "").toLowerCase()
  const launchKeywords = ["launched", "live", "production", "paying customers", "revenue generating", "shipped"]
  const hasLaunchSignal = launchKeywords.some((kw) => desc.includes(kw))
  if (hasLaunchSignal) base = Math.min(25, base + 5)

  // Progress field supplement
  if (project.progress >= 75 && base < 17) base = 17
  if (project.progress >= 100 && base < 25) base = 25

  return base
}

/**
 * UC — Update Currency (0–10)
 * Recency of the project's last update.
 */
function computeUpdateCurrency(lastUpdateDate: string | null): number {
  if (!lastUpdateDate) return 1

  const daysSince = Math.max(
    0,
    (Date.now() - new Date(lastUpdateDate).getTime()) / (1000 * 86_400)
  )

  if (daysSince < 7) return 10
  if (daysSince < 30) return 7
  if (daysSince < 90) return 4
  return 1
}

// ─── Insight Generation ───────────────────────────────────────────────────────

function generateInsights(
  components: SVSComponents,
  project: Project
): { insights: string[]; tips: string[] } {
  const insights: string[] = []
  const tips: string[] = []

  const { market_clarity, team_strength, content_signals, stage_score, update_currency } = components

  // Insights (positive signals)
  if (market_clarity >= 20) {
    insights.push("Strong market clarity — your description signals real business understanding to investors.")
  } else if (market_clarity >= 12) {
    insights.push("Good market language detected. Adding specific metrics (TAM, revenue target) would strengthen your profile.")
  }

  if (team_strength >= 17) {
    insights.push("Solid team composition — investors value diverse skill sets at the founding stage.")
  }

  if (content_signals >= 16) {
    insights.push("Excellent credibility artifacts — a pitch deck + website signals you're serious.")
  }

  if (stage_score >= 20) {
    insights.push("Advanced stage detected — being live/shipped significantly increases investor engagement.")
  }

  if ((project.collaborators?.length ?? 0) === 0) {
    insights.push("Solo founder detected. Adding co-founders or advisors can materially improve fundability.")
  }

  // Tips (prioritize lowest-scoring components)
  const componentList: [string, number, number][] = [
    ["market_clarity", market_clarity, 25],
    ["team_strength", team_strength, 20],
    ["content_signals", content_signals, 20],
    ["stage_score", stage_score, 25],
    ["update_currency", update_currency, 10],
  ]
  componentList.sort((a, b) => a[1] / a[2] - b[1] / b[2])

  const tipMap: Record<string, string> = {
    market_clarity:
      "Add market-specific language to your description: target customers, revenue model, problem/solution framing, and estimated market size.",
    team_strength:
      "Bring on a co-founder with complementary skills (e.g., technical + business) to boost your Team Strength score.",
    content_signals:
      "Upload a pitch deck link — it's worth 10 pts on its own and signals investor-readiness more than anything else.",
    stage_score:
      "Push your startup to the next stage (prototype → MVP → live) and update the project status to reflect real progress.",
    update_currency:
      "Log a project update at least once a month — active founders signal commitment to investors.",
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
 * Compute the full Startup Vitality Score for a given project.
 * All inputs are pre-fetched — no async calls inside.
 *
 * @param project - The project object (must have category = "business")
 * @param lastUpdateDate - ISO string of most recent project_update.created_at (or null)
 */
export function computeStartupVitalityScore(
  project: Project,
  lastUpdateDate: string | null
): StartupVitalityScore {
  const mc = computeMarketClarity(project)
  const ts = computeTeamStrength(project)
  const cs = computeContentSignals(project)
  const ss = computeStageScore(project)
  const uc = computeUpdateCurrency(lastUpdateDate)

  const raw = mc + ts + cs + ss + uc
  const total = Math.max(0, Math.min(100, Math.round(raw)))

  const grade: StartupVitalityScore["grade"] =
    total >= 80 ? "A"
    : total >= 60 ? "B"
    : total >= 40 ? "C"
    : "D"

  const components: SVSComponents = {
    market_clarity: mc,
    team_strength: ts,
    content_signals: cs,
    stage_score: ss,
    update_currency: uc,
  }

  const { insights, tips } = generateInsights(components, project)

  return {
    total,
    grade,
    components,
    insights,
    improvement_tips: tips,
  }
}

export { GRADE_CONFIG }
