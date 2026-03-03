/**
 * Opportunity upsert with deduplication.
 * Mirrors ec-scraper/src/api/postgres_sync.py
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ExtractedOpportunity } from "./ai-extract"
import { embedText, buildOpportunityEmbeddingText } from "@/lib/matching/embeddings"

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "mc_cid", "mc_eid", "ref", "source",
])

/** Normalize URL for deduplication (strip www, trailing slash, tracking params). */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    let host = parsed.hostname.toLowerCase()
    if (host.startsWith("www.")) host = host.slice(4)
    const path = parsed.pathname.replace(/\/+$/, "") || ""

    // Remove tracking params
    const params = new URLSearchParams(parsed.search)
    for (const key of [...params.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        params.delete(key)
      }
    }
    const query = params.toString()
    return `${parsed.protocol}//${host}${path}${query ? `?${query}` : ""}`
  } catch {
    return url
  }
}

/** Map type strings from AI to DB-compatible values. */
function normalizeType(type: string): string {
  const map: Record<string, string> = {
    "competition": "Competition",
    "internship": "Internship",
    "research": "Research",
    "summer program": "Summer Program",
    "summer_program": "Summer Program",
    "club": "Club",
    "scholarship": "Scholarship",
    "volunteer": "Volunteer",
    "camp": "Camp",
    "workshop": "Workshop",
    "course": "Course",
    "other": "Other",
    "award": "Other",
    "fellowship": "Fellowship",
    "program": "Summer Program",
  }
  return map[type.toLowerCase()] || type || "Other"
}

/** Map ExtractedOpportunity to a Supabase row. */
function buildRow(data: ExtractedOpportunity, sourceUrl: string) {
  const now = new Date().toISOString()
  return {
    url: data.url ? normalizeUrl(data.url) : normalizeUrl(sourceUrl),
    title: data.title,
    company: data.organization || "Unknown",
    location: data.location || "Remote",
    type: normalizeType(data.type),
    category: data.category || "Other",
    description: data.description || "",
    skills: data.skills || [],
    grade_levels: data.grade_levels?.length > 0 ? data.grade_levels : [9, 10, 11, 12],
    location_type: data.location_type || "Online",
    remote: (data.location_type || "Online").toLowerCase() === "online",
    deadline: data.deadline || null,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    cost: data.cost || null,
    extraction_confidence: data.extraction_confidence || 0.6,
    is_active: true,
    is_expired: false,
    timing_type: (data.timing_type || "annual") as "one-time" | "annual" | "recurring" | "rolling" | "ongoing" | "seasonal",
    source_url: sourceUrl,
    posted_date: now,
    last_verified: now,
    recheck_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    created_at: now,
    updated_at: now,
    applicants: 0,
  }
}

export interface UpsertResult {
  id: string
  isNew: boolean
}

/** Upsert a single opportunity with dedup by URL, then by title+company. */
export async function upsertOpportunity(
  data: ExtractedOpportunity,
  sourceUrl: string
): Promise<UpsertResult> {
  const supabase = createAdminClient()
  const row = buildRow(data, sourceUrl)
  const now = new Date().toISOString()

  // Skip invalid titles
  if (!row.title || row.title === "Unknown" || row.title.trim() === "") {
    throw new Error("Cannot upsert opportunity with empty title")
  }

  // Dedup check 1: URL match
  const { data: byUrl } = await supabase
    .from("opportunities")
    .select("id")
    .eq("url", row.url)
    .limit(1)

  if (byUrl && byUrl.length > 0) {
    const id = byUrl[0].id
    const { created_at, ...updateData } = row
    await supabase
      .from("opportunities")
      .update({ ...updateData, updated_at: now })
      .eq("id", id)
    return { id, isNew: false }
  }

  // Dedup check 2: title + company match (case-insensitive)
  const cleanTitle = row.title.trim()
  const cleanCompany = row.company.trim()
  if (cleanTitle && cleanCompany) {
    const { data: byTitleCompany } = await supabase
      .from("opportunities")
      .select("id")
      .ilike("title", cleanTitle)
      .ilike("company", cleanCompany)
      .limit(1)

    if (byTitleCompany && byTitleCompany.length > 0) {
      const id = byTitleCompany[0].id
      const { created_at, ...updateData } = row
      await supabase
        .from("opportunities")
        .update({ ...updateData, updated_at: now })
        .eq("id", id)
      return { id, isNew: false }
    }
  }

  // Insert new
  const newId = crypto.randomUUID()
  const insertData = { ...row, id: newId }

  const { error } = await supabase.from("opportunities").insert(insertData)
  if (error) {
    console.error(`[Upsert] Failed to insert "${row.title}":`, error.message)
    throw new Error(`Insert failed: ${error.message}`)
  }

  // Generate embedding for the new opportunity (non-blocking)
  try {
    const embeddingText = buildOpportunityEmbeddingText(insertData)
    const vector = await embedText(embeddingText, "RETRIEVAL_DOCUMENT")
    await supabase.from("opportunity_embeddings").upsert(
      {
        opportunity_id: newId,
        embedding: Array.from(vector),
        content: embeddingText,
      },
      { onConflict: "opportunity_id" }
    )
  } catch (embErr) {
    console.warn(`[Upsert] Embedding generation failed for "${row.title}", will retry later:`, embErr)
    // Non-fatal — the batch embed API can fill this in later
  }

  return { id: newId, isNew: true }
}

export interface BatchUpsertResult {
  inserted: number
  updated: number
  failed: number
  ids: string[]
}

/** Upsert a batch of opportunities. */
export async function upsertBatch(
  opportunities: ExtractedOpportunity[],
  sourceUrl: string
): Promise<BatchUpsertResult> {
  let inserted = 0
  let updated = 0
  let failed = 0
  const ids: string[] = []

  for (const opp of opportunities) {
    try {
      const result = await upsertOpportunity(opp, sourceUrl)
      ids.push(result.id)
      if (result.isNew) inserted++
      else updated++
    } catch (err) {
      console.error(`[Upsert Batch] Failed: ${opp.title}`, err)
      failed++
    }
  }

  return { inserted, updated, failed, ids }
}
