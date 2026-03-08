/**
 * RESEARCHER SCORING ENGINE — 100% Algorithmic
 *
 * Converts CORE CandidateAuthor profiles into the ScoredProfile shape the UI
 * already understands. Mirrors the investor-matching.ts pattern exactly.
 *
 * Dimension → ScoredProfile score mapping:
 *
 *   topic_match          (TF-IDF on titles + abstracts + topics)  → 30%
 *   student_collaboration (citation-count accessibility curve)     → 25%
 *   availability          (recent-paper count proxy)               → 20%
 *   experience_level      (citation-count tier)                    → 15%
 *   trend_alignment       (keyword hits in past-3-year papers)     → 10%
 *
 * Zero external HTTP calls beyond the single CORE search.
 */

import type { ScoredProfile } from "@/types/researcher"
import type { CandidateAuthor } from "./core-api"

// ─── Stop words ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "that", "this", "it", "its", "we", "our", "my", "your",
  "i", "want", "need", "looking", "find", "get", "make", "build", "create",
  "using", "use", "based", "via", "towards", "toward", "research", "study",
  "analysis", "approach", "method", "model", "system", "learning", "paper",
  "novel", "new", "proposed", "towards", "review", "survey",
])

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))]
}

// ─── Profile tier detection ───────────────────────────────────────────────────
// Without h-index we use citation count + paper count as proxies.

function detectTier(totalCitations: number, paperCount: number): ScoredProfile["profile_tier"] {
  if (totalCitations > 8000 || paperCount > 80)  return "phd_professor"
  if (totalCitations > 800  || paperCount > 20)  return "phd_professor"
  if (totalCitations > 80   || paperCount > 6)   return "postdoc"
  return "grad_student"
}

// ─── Institution → email domain map ──────────────────────────────────────────

const DOMAIN_MAP: Record<string, string> = {
  "massachusetts institute of technology": "mit.edu",
  "mit": "mit.edu",
  "stanford university": "stanford.edu",
  "harvard university": "harvard.edu",
  "university of california, berkeley": "berkeley.edu",
  "uc berkeley": "berkeley.edu",
  "carnegie mellon university": "cs.cmu.edu",
  "cmu": "cs.cmu.edu",
  "princeton university": "princeton.edu",
  "yale university": "yale.edu",
  "columbia university": "columbia.edu",
  "cornell university": "cornell.edu",
  "university of pennsylvania": "upenn.edu",
  "university of chicago": "uchicago.edu",
  "university of washington": "uw.edu",
  "university of michigan": "umich.edu",
  "georgia institute of technology": "gatech.edu",
  "georgia tech": "gatech.edu",
  "university of texas at austin": "utexas.edu",
  "university of california, los angeles": "ucla.edu",
  "ucla": "ucla.edu",
  "university of california, san diego": "ucsd.edu",
  "ucsd": "ucsd.edu",
  "university of illinois urbana-champaign": "illinois.edu",
  "new york university": "nyu.edu",
  "nyu": "nyu.edu",
  "duke university": "duke.edu",
  "johns hopkins university": "jhu.edu",
  "northwestern university": "northwestern.edu",
  "university of toronto": "utoronto.ca",
  "university of oxford": "ox.ac.uk",
  "university of cambridge": "cam.ac.uk",
  "eth zurich": "ethz.ch",
  "caltech": "caltech.edu",
  "california institute of technology": "caltech.edu",
  "brown university": "brown.edu",
  "rice university": "rice.edu",
  "vanderbilt university": "vanderbilt.edu",
  "university of notre dame": "nd.edu",
  "university of wisconsin-madison": "wisc.edu",
  "ohio state university": "osu.edu",
  "purdue university": "purdue.edu",
  "boston university": "bu.edu",
  "tufts university": "tufts.edu",
  "northeastern university": "northeastern.edu",
  "university of maryland": "umd.edu",
  "penn state": "psu.edu",
  "pennsylvania state university": "psu.edu",
  "broad institute": "broadinstitute.org",
  "allen institute": "alleninstitute.org",
  "salk institute": "salk.edu",
  "max planck": "mpg.de",
  "deepmind": "google.com",
  "google research": "google.com",
  "meta ai": "meta.com",
  "microsoft research": "microsoft.com",
  "ibm research": "ibm.com",
  "openai": "openai.com",
  "oxford": "ox.ac.uk",
  "cambridge": "cam.ac.uk",
  "berkeley": "berkeley.edu",
  "arxiv": "arxiv.org",
}

function resolveEmailDomain(affiliation: string): string {
  const lower = affiliation.toLowerCase()
  for (const [pattern, domain] of Object.entries(DOMAIN_MAP)) {
    if (lower.includes(pattern)) return domain
  }
  // Generic fallback: slugify institution name
  const slug = affiliation
    .toLowerCase()
    .replace(/university of\s+/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16)
  return slug ? `${slug}.edu` : "university.edu"
}

// ─── Scoring Dimension 1: Topic Match ─────────────────────────────────────────

function scoreTopicMatch(author: CandidateAuthor, keywords: string[]): number {
  if (keywords.length === 0) return 50

  const titleText    = author.papers.map((p) => p.title ?? "").join(" ").toLowerCase()
  const abstractText = author.papers.map((p) => p.abstract ?? "").join(" ").toLowerCase()
  const topicText    = author.topTopics.join(" ").toLowerCase()

  let hits = 0
  let titleHits = 0

  for (const kw of keywords) {
    const inTitle    = titleText.includes(kw)
    const inTopics   = topicText.includes(kw)
    const inAbstract = abstractText.includes(kw)

    if (inTitle)         { hits += 2; titleHits++ }
    else if (inTopics)   hits += 1.5
    else if (inAbstract) hits += 1
  }

  const maxHits = keywords.length * 2
  const ratio   = hits / Math.max(1, maxHits)

  let score = Math.round(Math.min(100, Math.tanh(ratio * 3) * 100))
  if (titleHits >= 2) score = Math.min(100, score + 10)

  return score
}

// ─── Scoring Dimension 2: Student Collaboration ───────────────────────────────
// Citation count as accessibility proxy: fewer citations = more reachable.

function scoreStudentCollaboration(author: CandidateAuthor): number {
  const cit = author.totalCitations
  const pc  = author.papers.length

  const citScore =
    cit === 0         ? 48 : // no data — neutral
    cit < 100         ? 72 : // early career — very accessible
    cit < 600         ? 67 : // junior faculty — eager collaborators
    cit < 2500        ? 56 : // established faculty
    cit < 10000       ? 44 : // senior professor
                        30   // eminent — very hard to reach directly

  // Papers in results: 3–8 = ideal (relevant + not overwhelmed)
  const paperScore =
    pc === 1  ? 52 :
    pc <= 3   ? 68 :
    pc <= 8   ? 72 :
    pc <= 15  ? 62 :
                50

  return Math.min(100, Math.round(citScore * 0.65 + paperScore * 0.35))
}

// ─── Scoring Dimension 3: Availability ────────────────────────────────────────

function scoreAvailability(author: CandidateAuthor): number {
  const recent = author.recentPapers.length

  if (recent === 0) return 22       // appears inactive
  if (recent === 1) return 58       // light output — has bandwidth
  if (recent <= 3)  return 80       // active sweet spot
  if (recent <= 7)  return 66       // very active
  return 48                          // extremely prolific — potentially too busy
}

// ─── Scoring Dimension 4: Experience Level ────────────────────────────────────

function scoreExperienceLevel(author: CandidateAuthor): number {
  const cit = author.totalCitations
  if (cit >= 15000) return 96
  if (cit >= 5000)  return 88
  if (cit >= 1500)  return 76
  if (cit >= 500)   return 64
  if (cit >= 100)   return 50
  if (cit >= 20)    return 38
  return 28
}

// ─── Scoring Dimension 5: Trend Alignment ────────────────────────────────────

function scoreTrendAlignment(author: CandidateAuthor, keywords: string[]): number {
  if (keywords.length === 0) return 50
  if (author.recentPapers.length === 0) return 18

  const recentText = author.recentPapers.map((p) => p.title ?? "").join(" ").toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    if (recentText.includes(kw)) hits++
  }

  const ratio = hits / keywords.length
  return Math.round(Math.min(100, 18 + ratio * 82))
}

// ─── Weighted overall match ───────────────────────────────────────────────────

function computeOverallMatch(scores: ScoredProfile["scores"]): number {
  return Math.round(
    scores.topic_match           * 0.30 +
    scores.student_collaboration * 0.25 +
    scores.availability          * 0.20 +
    scores.experience_level      * 0.15 +
    scores.trend_alignment       * 0.10
  )
}

// ─── Engagement Likelihood ────────────────────────────────────────────────────

function computeEngagementLikelihood(author: CandidateAuthor, topicScore: number): number {
  let score = 10 // cold email baseline

  const cit = author.totalCitations
  if      (cit < 100)   score += 18 // early career — eager
  else if (cit < 600)   score += 12 // junior faculty
  else if (cit < 2500)  score +=  6 // established

  if      (topicScore >= 80) score += 10
  else if (topicScore >= 60) score +=  5

  // Active recently → live projects to discuss
  if (author.recentPapers.length >= 2) score += 5

  // Very high citations = very hard to cold-reach
  if      (cit > 20000) score -= 12
  else if (cit > 5000)  score -=  6

  return Math.max(5, Math.min(55, Math.round(score)))
}

// ─── Contact Strategy ─────────────────────────────────────────────────────────

function generateContactStrategy(author: CandidateAuthor, keywords: string[]): string {
  // Pick the best paper to reference: keyword overlap + citation weight
  const scoredPapers = author.papers.map((p) => {
    const titleLower = (p.title ?? "").toLowerCase()
    const kwHits     = keywords.filter((kw) => titleLower.includes(kw)).length
    return { paper: p, score: kwHits * 3 + Math.log1p(p.citationCount ?? 0) }
  })
  scoredPapers.sort((a, b) => b.score - a.score)
  const topPaper = scoredPapers[0]?.paper

  const paperRef = topPaper?.title
    ? `their paper "${topPaper.title.slice(0, 65)}${topPaper.title.length > 65 ? "…" : ""}"`
    : "their recent work"

  const cit = author.totalCitations

  if (cit < 100) {
    return `Early-career researchers are often eager to collaborate with motivated students. Reference ${paperRef}, briefly explain your project, and ask one specific technical question. A 5–6 sentence email works best.`
  }
  if (cit < 600) {
    return `Reference ${paperRef} with a genuine observation. Describe your project in 2–3 sentences and mention what specific contribution you could make. Junior faculty building their groups are highly responsive to initiative.`
  }
  if (cit < 2500) {
    return `Be concise: reference ${paperRef} with one specific insight, describe your project in 2 sentences, and ask a focused question. If possible, attach a 1-page summary. Established professors respect preparation.`
  }
  return `Senior researchers respond to specificity and initiative. Reference ${paperRef} with a genuine technical observation, propose a well-scoped question or deliverable, and keep the email under 150 words. Consider reaching out to a lab member first as a warm introduction.`
}

// ─── Email Hint ───────────────────────────────────────────────────────────────

function generateEmailHint(author: CandidateAuthor): string {
  const domain = resolveEmailDomain(author.primaryAffiliation)
  const parts  = author.name.toLowerCase().trim().split(/\s+/)
  const first  = parts[0] ?? "firstname"
  const last   = parts[parts.length - 1] ?? "lastname"
  return `${first}.${last}@${domain}`
}

// ─── Research Focus ───────────────────────────────────────────────────────────

function buildResearchFocus(author: CandidateAuthor): string {
  const sorted = [...author.papers]
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 3)

  if (sorted.length === 0) return "Research details available via CORE open-access repository."

  const fields   = author.topTopics.slice(0, 3)
  const fieldStr = fields.length > 0 ? ` in ${fields.join(", ")}` : ""
  const topTitle = sorted[0]?.title ?? ""

  let focus = `Actively researches${fieldStr}. Notable work: "${topTitle.slice(0, 80)}${topTitle.length > 80 ? "…" : ""}".`
  if (sorted[1]?.title) {
    focus += ` Also published: "${sorted[1].title.slice(0, 80)}${sorted[1].title.length > 80 ? "…" : ""}".`
  }
  return focus
}

// ─── Evidence of Student Work ─────────────────────────────────────────────────

function buildEvidenceOfStudentWork(author: CandidateAuthor): string {
  const cit = author.totalCitations
  const aff = author.primaryAffiliation || "their institution"
  const pc  = author.papers.length

  const tier =
    cit > 8000  ? "senior researcher / full professor" :
    cit > 800   ? "established faculty member" :
    cit > 80    ? "junior faculty / postdoctoral researcher" :
                  "early-career researcher / PhD candidate"

  const mentorNote =
    cit > 8000
      ? `Senior researchers at ${aff} often coordinate REU and summer research opportunities for high school and undergraduate students.`
      : cit > 800
      ? `Faculty at ${aff} typically supervise undergraduate and graduate researchers in active research projects.`
      : cit > 80
      ? `Junior faculty at ${aff} actively build their research groups and frequently welcome undergraduate collaborators.`
      : `Early-career researchers at ${aff} regularly co-author with student collaborators on publications.`

  return `${author.name} is a ${tier} with ${pc} open-access papers on this topic. ${mentorNote}`
}

// ─── Main: CandidateAuthor → ScoredProfile ───────────────────────────────────

export function authorToScoredProfile(
  author: CandidateAuthor,
  keywords: string[]
): ScoredProfile {
  const topic_match           = scoreTopicMatch(author, keywords)
  const student_collaboration = scoreStudentCollaboration(author)
  const availability          = scoreAvailability(author)
  const experience_level      = scoreExperienceLevel(author)
  const trend_alignment       = scoreTrendAlignment(author, keywords)

  const scores: ScoredProfile["scores"] = {
    topic_match,
    student_collaboration,
    availability,
    experience_level,
    trend_alignment,
  }

  const overall_match         = computeOverallMatch(scores)
  const engagement_likelihood = computeEngagementLikelihood(author, topic_match)
  const contact_strategy      = generateContactStrategy(author, keywords)
  const email_hint            = generateEmailHint(author)
  const research_focus        = buildResearchFocus(author)
  const evidence_of_student_work = buildEvidenceOfStudentWork(author)

  const tier  = detectTier(author.totalCitations, author.papers.length)
  const title =
    tier === "grad_student" ? "PhD Researcher / Early-Career Scientist" :
    tier === "postdoc"      ? "Postdoctoral Researcher / Assistant Professor" :
                              "Professor / Principal Investigator"

  const topField = author.topTopics[0] ?? "Research"

  const currentYear  = new Date().getFullYear()
  const oldestYear   = Math.min(...author.papers.map((p) => p.yearPublished ?? currentYear))
  const yearsActive  = Math.max(1, currentYear - oldestYear)

  return {
    name:                    author.name,
    title,
    institution:             author.primaryAffiliation || "Academic Institution",
    department:              topField,
    type:                    "researcher",
    profile_tier:            tier,
    research_focus,
    evidence_of_student_work,
    scores,
    overall_match,
    engagement_likelihood,
    years_experience:        Math.max(1, yearsActive),
    active_projects:         Math.min(author.papers.length, 999),
    contact_strategy,
    email_hint,
  }
}
