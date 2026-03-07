/**
 * SEMANTIC SCHOLAR API CLIENT
 *
 * Wraps the Academic Graph API (https://api.semanticscholar.org/graph/v1).
 * Rate limit: 1 request/second with an API key.
 *
 * We make exactly ONE call per user search (author/search with enriched fields),
 * keeping total latency under 2 seconds and well within rate limits.
 */

const SS_BASE = "https://api.semanticscholar.org/graph/v1"

// Fields requested per author — rich enough to score without follow-up calls
const AUTHOR_FIELDS = [
  "name",
  "affiliations",
  "paperCount",
  "citationCount",
  "hIndex",
  "papers.title",
  "papers.year",
  "papers.citationCount",
  "papers.fieldsOfStudy",
].join(",")

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SSPaper {
  paperId: string
  title: string
  year: number | null
  citationCount: number
  fieldsOfStudy: string[] | null
}

export interface SSAffiliation {
  affiliationId: string | null
  name: string
}

export interface SSAuthor {
  authorId: string
  name: string
  affiliations: SSAffiliation[]
  paperCount: number
  citationCount: number
  hIndex: number
  papers: SSPaper[]
}

interface SSSearchResponse {
  total: number
  offset: number
  next?: number
  data: SSAuthor[]
}

// ─── Simple in-process rate limiter (1 req/sec) ───────────────────────────────

let _lastCallMs = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const gap = now - _lastCallMs
  if (gap < 1050) {
    // 50ms buffer above 1000ms to be safe
    await new Promise((r) => setTimeout(r, 1050 - gap))
  }
  _lastCallMs = Date.now()
}

// ─── Author Search ─────────────────────────────────────────────────────────────

/**
 * Search Semantic Scholar for authors matching a query.
 * Returns up to `limit` authors with enriched fields (papers, h-index, affiliations).
 *
 * @param query   - Free-text topic query (e.g. "machine learning fairness")
 * @param limit   - Max authors to return (default 20, max 100)
 */
export async function searchAuthors(query: string, limit = 20): Promise<SSAuthor[]> {
  await throttle()

  const url = new URL(`${SS_BASE}/author/search`)
  url.searchParams.set("query", query)
  url.searchParams.set("fields", AUTHOR_FIELDS)
  url.searchParams.set("limit", String(Math.min(limit, 100)))

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? ""

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: apiKey ? { "x-api-key": apiKey } : {},
    // No Next.js cache — searches must always be fresh
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Semantic Scholar ${res.status}: ${body.slice(0, 200)}`)
  }

  const json: SSSearchResponse = await res.json()
  return json.data ?? []
}

/**
 * Broaden a topic query by stripping low-signal words and returning the
 * top 2–3 content words. Used as a fallback when the primary query < 3 hits.
 */
export function broadenQuery(topic: string): string {
  const STRIP = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "using", "use", "based", "via", "toward", "towards",
  ])
  const words = topic.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
  const content = words.filter((w) => !STRIP.has(w))
  return [...new Set(content)].slice(0, 3).join(" ")
}
