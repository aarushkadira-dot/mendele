/**
 * RESEARCHER SCORING ENGINE — 100% Algorithmic
 *
 * Converts raw Semantic Scholar author data into the ScoredProfile shape the
 * UI already understands. Mirrors the investor-matching.ts pattern.
 *
 * Dimension → ScoredProfile score mapping:
 *
 *   topic_match          (paper titles + fieldsOfStudy TF-IDF)  → 30%
 *   student_collaboration (h-index accessibility + paper volume)  → 25%
 *   availability          (recent paper count proxy)              → 20%
 *   experience_level      (h-index tier)                         → 15%
 *   trend_alignment       (recent paper title keyword overlap)    → 10%
 *
 * Zero external HTTP calls beyond the single Semantic Scholar search.
 */

import type { ScoredProfile } from "@/types/researcher"
import type { SSAuthor, SSPaper } from "./semantic-scholar"

// ─── Stop words ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "that", "this", "it", "its", "we", "our", "my", "your",
  "i", "want", "need", "looking", "find", "get", "make", "build", "create",
  "using", "use", "based", "via", "towards", "toward", "research", "study",
  "analysis", "approach", "method", "model", "system", "learning",
])

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))]
}

// ─── Profile tier detection ───────────────────────────────────────────────────

function detectTier(hIndex: number): ScoredProfile["profile_tier"] {
  if (hIndex >= 60) return "phd_professor"   // eminent / lab director
  if (hIndex >= 20) return "phd_professor"   // full / associate professor
  if (hIndex >= 8)  return "postdoc"         // postdoc / assistant professor
  if (hIndex >= 2)  return "grad_student"    // PhD student
  return "grad_student"
}

// ─── Institution domain lookup ────────────────────────────────────────────────

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
  "upenn": "upenn.edu",
  "university of chicago": "uchicago.edu",
  "university of washington": "uw.edu",
  "university of michigan": "umich.edu",
  "georgia institute of technology": "gatech.edu",
  "georgia tech": "gatech.edu",
  "university of texas at austin": "utexas.edu",
  "ut austin": "utexas.edu",
  "university of california, los angeles": "ucla.edu",
  "ucla": "ucla.edu",
  "university of california, san diego": "ucsd.edu",
  "ucsd": "ucsd.edu",
  "university of illinois urbana-champaign": "illinois.edu",
  "uiuc": "illinois.edu",
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
  "dartmouth college": "dartmouth.edu",
  "rice university": "rice.edu",
  "vanderbilt university": "vanderbilt.edu",
  "university of notre dame": "nd.edu",
  "university of wisconsin-madison": "wisc.edu",
  "ohio state university": "osu.edu",
  "university of minnesota": "umn.edu",
  "purdue university": "purdue.edu",
  "boston university": "bu.edu",
  "tufts university": "tufts.edu",
  "northeastern university": "northeastern.edu",
  "university of massachusetts amherst": "umass.edu",
  "umass amherst": "umass.edu",
  "university of colorado boulder": "colorado.edu",
  "university of maryland": "umd.edu",
  "penn state": "psu.edu",
  "pennsylvania state university": "psu.edu",
  "broad institute": "broadinstitute.org",
  "allen institute": "alleninstitute.org",
  "salk institute": "salk.edu",
  "whitehead institute": "wi.mit.edu",
  "max planck": "mpg.de",
  "deepmind": "google.com",
  "google research": "google.com",
  "google brain": "google.com",
  "meta ai": "meta.com",
  "meta": "meta.com",
  "microsoft research": "microsoft.com",
  "ibm research": "ibm.com",
  "openai": "openai.com",
  "berkeley": "berkeley.edu",
  "oxford": "ox.ac.uk",
  "cambridge": "cam.ac.uk",
}

function resolveEmailDomain(affiliations: SSAuthor["affiliations"]): string {
  for (const aff of affiliations) {
    const key = aff.name.toLowerCase()
    for (const [pattern, domain] of Object.entries(DOMAIN_MAP)) {
      if (key.includes(pattern)) return domain
    }
  }
  // Generic fallback: slugify first affiliation name
  if (affiliations.length > 0) {
    const slug = affiliations[0].name
      .toLowerCase()
      .replace(/university of\s+/i, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 16)
    return slug ? `${slug}.edu` : "university.edu"
  }
  return "university.edu"
}

// ─── Scoring Dimension 1: Topic Match ─────────────────────────────────────────
// TF-IDF over paper titles + fieldsOfStudy + affiliation name

function scoreTopicMatch(author: SSAuthor, keywords: string[]): number {
  if (keywords.length === 0) return 50

  const paperTitles = author.papers.map((p) => p.title ?? "").join(" ").toLowerCase()
  const fieldText = author.papers
    .flatMap((p) => p.fieldsOfStudy ?? [])
    .join(" ")
    .toLowerCase()
  const affText = author.affiliations.map((a) => a.name).join(" ").toLowerCase()

  let hits = 0
  let titleHits = 0

  for (const kw of keywords) {
    const inTitle = paperTitles.includes(kw)
    const inField = fieldText.includes(kw)
    const inAff   = affText.includes(kw)

    if (inTitle)       { hits += 2; titleHits++ }
    else if (inField)  hits += 1.5
    else if (inAff)    hits += 0.5
  }

  const maxHits = keywords.length * 2
  const ratio   = hits / Math.max(1, maxHits)

  let score = Math.round(Math.min(100, Math.tanh(ratio * 3) * 100))

  // Bonus: many paper title hits → strong signal
  if (titleHits >= 3) score = Math.min(100, score + 10)

  return score
}

// ─── Scoring Dimension 2: Student Collaboration ───────────────────────────────
// Sweet spot: h-index 8–30 = accessible but established; large groups = mentors more students

function scoreStudentCollaboration(author: SSAuthor): number {
  const h = author.hIndex

  // h-index accessibility curve
  const hScore =
    h === 0            ? 25 :
    h < 5              ? 40 : // Very early career — limited mentoring capacity
    h < 12             ? 72 : // Postdoc / early faculty — eager collaborators
    h < 25             ? 65 : // Established faculty — mentor undergrads via lab
    h < 50             ? 52 : // Senior prof — busy but has lab students
                         38   // Eminent — very hard to reach directly

  // Paper volume proxy: 20–150 papers = active enough to have live projects
  const pc = author.paperCount
  const paperScore =
    pc < 5    ? 25 :
    pc < 20   ? 50 :
    pc < 80   ? 75 :
    pc < 200  ? 65 :
                50

  return Math.min(100, Math.round(hScore * 0.65 + paperScore * 0.35))
}

// ─── Scoring Dimension 3: Availability ────────────────────────────────────────
// Proxy: recent paper activity. Active researchers have live projects to involve students in.

function scoreAvailability(author: SSAuthor): number {
  const currentYear = new Date().getFullYear()
  const recent = author.papers.filter((p) => p.year != null && p.year >= currentYear - 2).length

  if (recent === 0) return 20       // Appears inactive — risky
  if (recent <= 2)  return 55       // Light output — may have bandwidth
  if (recent <= 6)  return 78       // Active sweet spot
  if (recent <= 12) return 65       // Very active — might be busy
  return 45                          // Extremely prolific — potentially overwhelmed
}

// ─── Scoring Dimension 4: Experience Level ────────────────────────────────────
// h-index is the most reliable proxy for academic seniority

function scoreExperienceLevel(author: SSAuthor): number {
  const h = author.hIndex
  if (h >= 80) return 98
  if (h >= 50) return 92
  if (h >= 30) return 82
  if (h >= 15) return 70
  if (h >= 8)  return 56
  if (h >= 3)  return 42
  return 30
}

// ─── Scoring Dimension 5: Trend Alignment ────────────────────────────────────
// How closely the researcher's RECENT work (past 3 years) matches the topic

function scoreTrendAlignment(author: SSAuthor, keywords: string[]): number {
  if (keywords.length === 0) return 50

  const currentYear = new Date().getFullYear()
  const recentPapers = author.papers.filter(
    (p) => p.year != null && p.year >= currentYear - 3
  )

  if (recentPapers.length === 0) return 25 // No recent output

  const recentText = recentPapers.map((p) => p.title ?? "").join(" ").toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    if (recentText.includes(kw)) hits++
  }

  const ratio = hits / keywords.length
  return Math.round(Math.min(100, 25 + ratio * 75))
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

function computeEngagementLikelihood(author: SSAuthor, topicScore: number): number {
  // Base cold-email reply rate for academic researchers
  let score = 10

  const h = author.hIndex

  // Accessibility bonus: postdocs/junior faculty respond more
  if (h >= 5  && h < 15) score += 18
  else if (h < 25)       score += 12
  else if (h < 50)       score += 6
  // Senior professors: no bonus — harder to reach

  // Topic match bonus
  if (topicScore >= 80) score += 10
  else if (topicScore >= 60) score += 5

  // Recency: actively publishing means active lab = more chances to engage
  const currentYear = new Date().getFullYear()
  const recentPapers = author.papers.filter(
    (p) => p.year != null && p.year >= currentYear - 1
  ).length
  if (recentPapers >= 2) score += 5

  // Volume penalty: > 500 papers → very senior, much harder to reach
  if (author.citationCount > 50000) score -= 10
  else if (author.citationCount > 20000) score -= 5

  return Math.max(5, Math.min(55, Math.round(score)))
}

// ─── Contact Strategy ─────────────────────────────────────────────────────────
// Template-based, zero AI. Uses h-index tier + top-cited recent paper.

function generateContactStrategy(author: SSAuthor, keywords: string[]): string {
  const h = author.hIndex
  const currentYear = new Date().getFullYear()

  // Find the best paper to reference: prefer recent + highly-cited + keyword overlap
  const scoredPapers = author.papers.map((p) => {
    const titleLower = (p.title ?? "").toLowerCase()
    const kwHits = keywords.filter((kw) => titleLower.includes(kw)).length
    const recency = (p.year ?? 0) >= currentYear - 2 ? 2 : 1
    return { paper: p, score: kwHits * 3 + recency + (p.citationCount > 10 ? 1 : 0) }
  })
  scoredPapers.sort((a, b) => b.score - a.score)
  const topPaper = scoredPapers[0]?.paper

  const paperRef = topPaper?.title
    ? `their paper "${topPaper.title.slice(0, 60)}${topPaper.title.length > 60 ? "…" : ""}"`
    : "their recent work"

  if (h < 10) {
    // PhD student / early postdoc — most accessible
    return `PhD students and postdocs are often the most eager to collaborate. Reference ${paperRef}, share your project briefly, and ask one specific technical question. A 5–6 sentence email is ideal.`
  }

  if (h < 20) {
    // Junior faculty / postdoc — building their research group
    return `Reference ${paperRef} with a specific observation. Mention your background and project in 2–3 sentences. Junior faculty actively building research groups are highly responsive to initiative from students.`
  }

  if (h < 40) {
    // Established professor — busy, needs specificity
    return `Be concise: reference ${paperRef} with one specific technical insight, explain your project in 2 sentences, and ask a focused question. Attach a 1-page summary. Professors at this level respond to preparation.`
  }

  // Senior / eminent professor — need a strong hook
  return `Senior researchers respond to specificity and initiative. Reference ${paperRef} with a genuine observation, propose a concrete well-scoped question or micro-deliverable, and keep the email under 150 words. Consider reaching out to a lab member first as a warm introduction.`
}

// ─── Email Hint ───────────────────────────────────────────────────────────────

function generateEmailHint(author: SSAuthor): string {
  const domain = resolveEmailDomain(author.affiliations)
  const parts   = author.name.toLowerCase().split(/\s+/)
  const first   = parts[0] ?? "firstname"
  const last    = parts[parts.length - 1] ?? "lastname"

  // Most common academic email formats
  return `${first}.${last}@${domain}`
}

// ─── Research Focus Summary ───────────────────────────────────────────────────
// Derives a 2-sentence description from top papers

function buildResearchFocus(author: SSAuthor): string {
  const currentYear = new Date().getFullYear()

  // Sort papers: recent + highly cited first
  const sorted = [...author.papers]
    .sort((a, b) => {
      const recA = (a.year ?? 0) >= currentYear - 3 ? 1 : 0
      const recB = (b.year ?? 0) >= currentYear - 3 ? 1 : 0
      return recB - recA || b.citationCount - a.citationCount
    })
    .slice(0, 3)

  if (sorted.length === 0) return "Research details available via Semantic Scholar profile."

  const titles = sorted.map((p) => p.title ?? "").filter(Boolean)

  // Unique fieldsOfStudy across all papers
  const fields = [
    ...new Set(author.papers.flatMap((p) => p.fieldsOfStudy ?? []).filter(Boolean)),
  ].slice(0, 3)

  const fieldStr = fields.length > 0 ? ` in ${fields.join(", ")}` : ""
  const topTitle  = titles[0] ?? ""
  const otherTitles = titles.slice(1).join("; ")

  let focus = `Actively researches${fieldStr}. Notable recent work: "${topTitle.slice(0, 80)}${topTitle.length > 80 ? "…" : ""}".`
  if (otherTitles) {
    focus += ` Also working on: ${otherTitles.slice(0, 120)}${otherTitles.length > 120 ? "…" : ""}.`
  }

  return focus
}

// ─── Evidence of Student Work ─────────────────────────────────────────────────
// Heuristic — we infer accessibility from h-index tier and institution type

function buildEvidenceOfStudentWork(author: SSAuthor): string {
  const h    = author.hIndex
  const aff  = author.affiliations[0]?.name ?? "their institution"
  const pc   = author.paperCount

  const tier =
    h < 10  ? "PhD student or postdoctoral researcher"  :
    h < 20  ? "junior faculty member"                   :
    h < 40  ? "established professor"                   :
               "senior faculty / lab director"

  const mentorNote =
    h < 10  ? `${aff} PhD students and postdocs regularly co-author with undergrads and high school students on research projects.`         :
    h < 20  ? `Junior faculty at ${aff} typically supervise 2–5 undergraduate or graduate students and are actively expanding their research group.` :
    h < 40  ? `Established professors at ${aff} lead labs with undergraduate, graduate, and visiting student researchers.`                  :
               `Senior researchers at ${aff} often coordinate REU/UROP programs and summer research opportunities for high school and undergraduate students.`

  return `${author.name} is a ${tier} with ${pc} published papers. ${mentorNote}`
}

// ─── Main: SSAuthor → ScoredProfile ──────────────────────────────────────────

export function authorToScoredProfile(
  author: SSAuthor,
  keywords: string[]
): ScoredProfile {
  const topic_match          = scoreTopicMatch(author, keywords)
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

  const primaryAff = author.affiliations[0]?.name ?? "Unknown Institution"
  const tier       = detectTier(author.hIndex)

  // Infer title from tier
  const title =
    tier === "grad_student" ? "PhD Researcher" :
    tier === "postdoc"      ? "Postdoctoral Researcher / Assistant Professor" :
                              "Professor / Principal Investigator"

  // Infer department from fieldsOfStudy
  const topField = author.papers
    .flatMap((p) => p.fieldsOfStudy ?? [])
    .filter(Boolean)[0] ?? "Research"

  const currentYear = new Date().getFullYear()
  const yearsActive = author.papers.length > 0
    ? Math.max(
        1,
        currentYear - Math.min(...author.papers.map((p) => p.year ?? currentYear))
      )
    : 1

  return {
    name:                    author.name,
    title,
    institution:             primaryAff,
    department:              topField,
    type:                    "researcher",
    profile_tier:            tier,
    research_focus,
    evidence_of_student_work,
    scores,
    overall_match,
    engagement_likelihood,
    years_experience:        Math.max(1, yearsActive),
    active_projects:         Math.min(author.paperCount, 999),
    contact_strategy,
    email_hint,
  }
}
