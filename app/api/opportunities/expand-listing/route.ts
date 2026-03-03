/**
 * POST /api/opportunities/expand-listing
 *
 * Expand an aggregator/directory URL into individual opportunities.
 * Fetches the page, extracts individual opportunities via Gemini, upserts to Supabase.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchPageContent } from "@/lib/opportunities/fetch-page"
import { extractOpportunities } from "@/lib/opportunities/ai-extract"
import { upsertBatch } from "@/lib/opportunities/upsert"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { opportunityId, url: directUrl } = body as {
      opportunityId?: string
      url?: string
    }

    if (!opportunityId && !directUrl) {
      return NextResponse.json(
        { error: "Provide either opportunityId or url" },
        { status: 400 }
      )
    }

    // Get the URL to expand
    let targetUrl: string
    let originalDescription: string | null = null

    if (opportunityId) {
      const adminSupabase = createAdminClient()
      const { data: opp } = await adminSupabase
        .from("opportunities")
        .select("url, source_url, description")
        .eq("id", opportunityId)
        .single()

      if (!opp) {
        return NextResponse.json({ error: "Opportunity not found" }, { status: 404 })
      }

      targetUrl = opp.url || opp.source_url || ""
      originalDescription = opp.description
    } else {
      targetUrl = directUrl!
    }

    if (!targetUrl) {
      return NextResponse.json({ error: "No URL available" }, { status: 400 })
    }

    // Fetch page content
    const pageResult = await fetchPageContent(targetUrl)
    if (pageResult.error || !pageResult.content) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch page: ${pageResult.error ?? "no content"}` },
        { status: 200 }
      )
    }

    // Extract opportunities via AI
    const extraction = await extractOpportunities(pageResult.content, targetUrl)

    if (extraction.opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        isListPage: false,
        extracted: 0,
        inserted: 0,
        updated: 0,
        opportunities: [],
        message: "No individual opportunities found on this page.",
      })
    }

    // Upsert to database
    const upsertResult = await upsertBatch(extraction.opportunities, targetUrl)

    // Mark original aggregator entry as inactive if we extracted from it
    if (opportunityId && extraction.isListPage && extraction.opportunities.length > 1) {
      const adminSupabase = createAdminClient()
      await adminSupabase
        .from("opportunities")
        .update({
          is_active: false,
          description: `[AGGREGATOR] ${(originalDescription || "").slice(0, 200)}. Expanded into ${extraction.opportunities.length} individual opportunities.`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunityId)
    }

    return NextResponse.json({
      success: true,
      isListPage: extraction.isListPage,
      extracted: extraction.opportunities.length,
      inserted: upsertResult.inserted,
      updated: upsertResult.updated,
      opportunities: extraction.opportunities.map((opp, i) => ({
        id: upsertResult.ids[i] || null,
        title: opp.title,
        company: opp.organization,
        isNew: i < upsertResult.inserted,
      })),
    })
  } catch (error: any) {
    console.error("[Expand Listing] Error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
