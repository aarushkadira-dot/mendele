/**
 * Batch Embedding API — Seed opportunity embeddings
 *
 * POST /api/matching/embed-opportunities
 *
 * Embeds all active opportunities that don't yet have embeddings stored
 * in the opportunity_embeddings table. Processes in batches of 100 with
 * 1-second pauses between batches to respect Gemini API rate limits.
 *
 * This is idempotent — re-running skips already-embedded opportunities.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { embedBatch, buildOpportunityEmbeddingText } from "@/lib/matching/embeddings"

export const maxDuration = 300 // 5 minutes for batch processing

export async function POST() {
  const startTime = Date.now()
  const supabase = createAdminClient()

  try {
    // ── Fetch existing embedding IDs ──
    const { data: existingEmbeddings, error: embError } = await supabase
      .from("opportunity_embeddings")
      .select("opportunity_id")

    if (embError) {
      return NextResponse.json(
        { error: `Failed to fetch existing embeddings: ${embError.message}` },
        { status: 500 }
      )
    }

    const existingIds = new Set(
      (existingEmbeddings || []).map((e: any) => e.opportunity_id)
    )

    // ── Fetch all active opportunities ──
    const { data: opportunities, error: oppError } = await supabase
      .from("opportunities")
      .select("id, title, description, category, type, skills, company")
      .eq("is_active", true)
      .neq("title", "Unknown")
      .neq("title", "")

    if (oppError) {
      return NextResponse.json(
        { error: `Failed to fetch opportunities: ${oppError.message}` },
        { status: 500 }
      )
    }

    // ── Filter to un-embedded opportunities ──
    const toEmbed = (opportunities || []).filter(
      (opp: any) => !existingIds.has(opp.id)
    )

    if (toEmbed.length === 0) {
      return NextResponse.json({
        message: "All opportunities already have embeddings",
        embedded: 0,
        skipped: existingIds.size,
        total: (opportunities || []).length,
        durationMs: Date.now() - startTime,
      })
    }

    // ── Process in batches of 100 ──
    const BATCH_SIZE = 100
    let embedded = 0
    let errors = 0

    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE)

      // Build embedding texts
      const texts = batch.map((opp: any) => buildOpportunityEmbeddingText(opp))

      try {
        // Batch embed with RETRIEVAL_DOCUMENT task type
        const vectors = await embedBatch(texts, "RETRIEVAL_DOCUMENT")

        // Prepare rows for upsert
        const rows = batch.map((opp: any, idx: number) => ({
          opportunity_id: opp.id,
          embedding: Array.from(vectors[idx]), // Convert Float32Array to number[] for Supabase
          content: texts[idx],
        }))

        // Upsert into opportunity_embeddings
        const { error: upsertError } = await supabase
          .from("opportunity_embeddings")
          .upsert(rows, { onConflict: "opportunity_id" })

        if (upsertError) {
          console.error(`[EmbedBatch] Upsert error for batch ${i / BATCH_SIZE}:`, upsertError.message)
          errors += batch.length
        } else {
          embedded += batch.length
        }
      } catch (batchError) {
        console.error(`[EmbedBatch] Batch ${i / BATCH_SIZE} failed:`, batchError)
        errors += batch.length
      }

      // Rate limit: 1 second pause between batches
      if (i + BATCH_SIZE < toEmbed.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      // Log progress
      console.log(
        `[EmbedBatch] Progress: ${Math.min(i + BATCH_SIZE, toEmbed.length)}/${toEmbed.length} (${embedded} embedded, ${errors} errors)`
      )
    }

    return NextResponse.json({
      message: "Embedding complete",
      embedded,
      skipped: existingIds.size,
      errors,
      total: (opportunities || []).length,
      durationMs: Date.now() - startTime,
    })
  } catch (error) {
    console.error("[EmbedBatch] Fatal error:", error)
    return NextResponse.json(
      { error: `Embedding failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
