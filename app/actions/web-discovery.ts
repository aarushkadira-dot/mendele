"use server"

/**
 * Web discovery: search the web, crawl results, extract opportunities, save to DB.
 * Replaces the broken Python scraper backend for the triggerDiscovery() flow.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchPageContent } from "@/lib/opportunities/fetch-page"
import { extractOpportunities } from "@/lib/opportunities/ai-extract"
import { upsertBatch, normalizeUrl } from "@/lib/opportunities/upsert"
import { fuzzyCorrectQuery } from "@/lib/search/query-parser"

export interface WebDiscoveryResult {
  success: boolean
  message: string
  newOpportunities: number
  opportunityIds: string[]
}

// ─── DuckDuckGo HTML Search ────────────────────────────────────────────────

interface SearchResult {
  url: string
  title: string
  snippet: string
}

const SEARCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

const BLOCKED_DOMAINS = new Set([
  "youtube.com", "reddit.com", "quora.com", "facebook.com", "twitter.com",
  "x.com", "instagram.com", "tiktok.com", "pinterest.com", "linkedin.com",
  "amazon.com", "ebay.com", "wikipedia.org", "duckduckgo.com",
])

async function searchWeb(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  const searchQuery = `${query} high school students opportunities programs ${new Date().getFullYear()}`

  try {
    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": SEARCH_USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: new URLSearchParams({ q: searchQuery, kl: "us-en" }).toString(),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      console.error(`[Web Discovery] DuckDuckGo returned ${response.status}`)
      return []
    }

    const html = await response.text()

    // Parse search results from DuckDuckGo HTML
    const results: SearchResult[] = []
    const resultPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

    const links = [...html.matchAll(resultPattern)]
    const snippets = [...html.matchAll(snippetPattern)]

    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
      let rawUrl = links[i][1]
      const rawTitle = links[i][2].replace(/<[^>]+>/g, "").trim()
      const rawSnippet = snippets[i]?.[1]?.replace(/<[^>]+>/g, "").trim() || ""

      // DuckDuckGo wraps URLs in their redirect — extract actual URL
      if (rawUrl.includes("uddg=")) {
        const match = rawUrl.match(/uddg=([^&]+)/)
        if (match) rawUrl = decodeURIComponent(match[1])
      }

      // Skip non-http URLs and blocked domains
      if (!rawUrl.startsWith("http")) continue
      try {
        const domain = new URL(rawUrl).hostname.replace(/^www\./, "")
        if (BLOCKED_DOMAINS.has(domain)) continue
      } catch {
        continue
      }

      results.push({ url: rawUrl, title: rawTitle, snippet: rawSnippet })
    }

    console.log(`[Web Discovery] Found ${results.length} web results for "${query}"`)
    return results
  } catch (err: any) {
    console.error("[Web Discovery] Search failed:", err.message)
    return []
  }
}

// ─── Process a single URL ──────────────────────────────────────────────────

async function processUrl(
  url: string,
  _query: string
): Promise<{ ids: string[]; inserted: number }> {
  // Fetch page
  const page = await fetchPageContent(url, { timeout: 8000 })
  if (page.error || !page.content) {
    console.log(`[Web Discovery] Skip ${url}: ${page.error ?? "no content"}`)
    return { ids: [], inserted: 0 }
  }

  // Extract opportunities
  const extraction = await extractOpportunities(page.content, url)
  if (extraction.opportunities.length === 0) {
    return { ids: [], inserted: 0 }
  }

  // Upsert to DB
  const result = await upsertBatch(extraction.opportunities, url)
  console.log(
    `[Web Discovery] ${url}: ${result.inserted} new, ${result.updated} updated, ${result.failed} failed`
  )

  return { ids: result.ids, inserted: result.inserted }
}

// ─── Main discovery function ───────────────────────────────────────────────

export async function discoverOpportunities(
  query: string
): Promise<WebDiscoveryResult> {
  const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 100).trim()

  if (!sanitized || sanitized.length < 3) {
    return {
      success: false,
      message: "Query too short",
      newOpportunities: 0,
      opportunityIds: [],
    }
  }

  try {
    // Step 0: Correct misspellings in the query before searching
    const { corrected, wasChanged } = fuzzyCorrectQuery(sanitized)
    const searchQuery = wasChanged ? corrected : sanitized
    if (wasChanged) {
      console.log(`[Web Discovery] Spell correction: "${sanitized}" → "${corrected}"`)
    }

    // Step 1: Search the web
    const searchResults = await searchWeb(searchQuery, 10)
    if (searchResults.length === 0) {
      return {
        success: true,
        message: "No web results found for this query.",
        newOpportunities: 0,
        opportunityIds: [],
      }
    }

    // Step 2: Filter out URLs already in our DB
    const supabase = createAdminClient()
    const normalizedUrls = searchResults.map((r) => normalizeUrl(r.url))

    const { data: existing } = await supabase
      .from("opportunities")
      .select("url")
      .in("url", normalizedUrls)

    const existingUrls = new Set((existing || []).map((e: any) => e.url))
    const newResults = searchResults.filter(
      (r) => !existingUrls.has(normalizeUrl(r.url))
    )

    if (newResults.length === 0) {
      return {
        success: true,
        message: "All results already in database.",
        newOpportunities: 0,
        opportunityIds: [],
      }
    }

    // Step 3: Process top 5 new URLs in parallel
    const toProcess = newResults.slice(0, 5)
    const results = await Promise.allSettled(
      toProcess.map((r) => processUrl(r.url, sanitized))
    )

    // Step 4: Aggregate results
    let totalInserted = 0
    const allIds: string[] = []

    for (const result of results) {
      if (result.status === "fulfilled") {
        totalInserted += result.value.inserted
        allIds.push(...result.value.ids)
      }
    }

    console.log(
      `[Web Discovery] Complete: ${totalInserted} new opportunities from ${toProcess.length} URLs`
    )

    return {
      success: true,
      message:
        totalInserted > 0
          ? `Discovered ${totalInserted} new opportunities!`
          : "Search complete. No new opportunities found.",
      newOpportunities: totalInserted,
      opportunityIds: allIds,
    }
  } catch (error: any) {
    console.error("[Web Discovery] Error:", error)
    return {
      success: false,
      message: "Discovery failed. Please try again later.",
      newOpportunities: 0,
      opportunityIds: [],
    }
  }
}
