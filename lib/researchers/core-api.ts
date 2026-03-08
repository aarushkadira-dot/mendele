/**
 * CORE API CLIENT (core.ac.uk)
 *
 * Searches the world's largest open-access research aggregator (200M+ papers).
 * Strategy: search for papers by topic → aggregate unique authors → score.
 *
 * Base URL : https://api.core.ac.uk/v3
 * Auth     : Authorization: Bearer <CORE_API_KEY>
 * Docs     : https://api.core.ac.uk/docs/v3
 */

const CORE_BASE = "https://api.core.ac.uk/v3"

// ─── API response types ───────────────────────────────────────────────────────

export interface CORERawWork {
  id: number | string
  title: string
  abstract?: string
  authors: Array<{ name: string; id?: string }>
  yearPublished?: number
  citationCount?: number
  downloadUrl?: string
  doi?: string
  topics?: Array<{ id?: string; name: string }>
  subjects?: string[]
  publisher?: string
  journals?: Array<{ title: string }>
  repositories?: Array<{
    id?: number
    name?: string
    institution?: { name: string }
  }>
}

interface CORESearchResponse {
  totalHits: number
  limit: number
  offset: number
  results: CORERawWork[]
}

// ─── Aggregated author shape ──────────────────────────────────────────────────

export interface CandidateAuthor {
  name: string
  papers: CORERawWork[]       // papers by this author found in the search
  totalCitations: number      // sum of citationCount across their papers
  primaryAffiliation: string  // institution from most recent paper
  recentPapers: CORERawWork[] // papers published in the past 3 years
  topTopics: string[]         // aggregated topic/subject tags
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\-]/g, "")
}

function extractAffiliation(work: CORERawWork): string {
  // 1. Repository institution (most reliable)
  const repoInst = work.repositories
    ?.map((r) => r.institution?.name)
    .find(Boolean)
  if (repoInst) return repoInst

  // 2. Publisher
  if (work.publisher) return work.publisher

  // 3. Journal name as proxy
  if (work.journals?.[0]?.title) return work.journals[0].title

  return ""
}

// ─── searchWorks ──────────────────────────────────────────────────────────────

/**
 * Search CORE for papers matching a topic query.
 * A single call returns up to 100 papers with full metadata.
 *
 * @param query  Free-text query (e.g. "CRISPR gene editing cancer")
 * @param limit  Max papers to retrieve (default 50, max 100)
 */
export async function searchWorks(query: string, limit = 50): Promise<CORERawWork[]> {
  const url = new URL(`${CORE_BASE}/search/works`)
  url.searchParams.set("q", query)
  url.searchParams.set("limit", String(Math.min(limit, 100)))

  const apiKey = process.env.CORE_API_KEY ?? ""

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`CORE API ${res.status}: ${body.slice(0, 300)}`)
  }

  const json: CORESearchResponse = await res.json()
  return json.results ?? []
}

// ─── aggregateAuthors ─────────────────────────────────────────────────────────

/**
 * Group papers by author and build CandidateAuthor profiles.
 * Authors who appear in more relevant papers surface higher.
 */
export function aggregateAuthors(works: CORERawWork[]): CandidateAuthor[] {
  const currentYear = new Date().getFullYear()

  // Map: normalized-name → mutable entry
  const authorMap = new Map<
    string,
    { displayName: string; papers: CORERawWork[]; totalCitations: number }
  >()

  for (const work of works) {
    if (!work.authors?.length) continue

    for (const author of work.authors) {
      const raw = author.name?.trim()
      if (!raw || raw.length < 3) continue

      const key = normalizeName(raw)
      if (key.length < 3) continue

      if (!authorMap.has(key)) {
        authorMap.set(key, { displayName: raw, papers: [], totalCitations: 0 })
      }

      const entry = authorMap.get(key)!
      entry.papers.push(work)
      entry.totalCitations += work.citationCount ?? 0
    }
  }

  const candidates: CandidateAuthor[] = []

  for (const entry of authorMap.values()) {
    // Sort their papers newest-first
    const sorted = [...entry.papers].sort(
      (a, b) => (b.yearPublished ?? 0) - (a.yearPublished ?? 0)
    )

    const recentPapers = sorted.filter(
      (p) => p.yearPublished != null && p.yearPublished >= currentYear - 3
    )

    // Affiliation: walk newest papers until we find one
    let primaryAffiliation = ""
    for (const paper of sorted) {
      const aff = extractAffiliation(paper)
      if (aff) { primaryAffiliation = aff; break }
    }

    // Aggregate topics + subjects
    const topicSet = new Set<string>()
    for (const paper of entry.papers) {
      for (const t of paper.topics ?? []) {
        if (t.name) topicSet.add(t.name)
      }
      for (const s of paper.subjects ?? []) {
        if (s) topicSet.add(s)
      }
    }

    candidates.push({
      name: entry.displayName,
      papers: sorted,
      totalCitations: entry.totalCitations,
      primaryAffiliation,
      recentPapers,
      topTopics: [...topicSet].slice(0, 6),
    })
  }

  // Primary sort: paper count (more papers = more central to topic)
  // Tiebreak: citations (more citations = higher experience)
  candidates.sort((a, b) => {
    if (b.papers.length !== a.papers.length) return b.papers.length - a.papers.length
    return b.totalCitations - a.totalCitations
  })

  return candidates
}

// ─── broadenQuery ─────────────────────────────────────────────────────────────

const _QUERY_STRIP = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "using", "use", "based", "via", "toward", "towards",
])

/**
 * Return a 2–3 keyword fallback query when the primary query is too narrow.
 */
export function broadenQuery(topic: string): string {
  const words = topic.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
  const content = words.filter((w) => !_QUERY_STRIP.has(w))
  return [...new Set(content)].slice(0, 3).join(" ")
}
