import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, createClient } from "@/lib/supabase/server"
import { computeStartupVitalityScore } from "@/lib/business/startup-vitality-score"
import type { ProjectLink } from "@/lib/projects"
import type { StartupVitalityScore } from "@/lib/business/startup-vitality-score"

export const maxDuration = 10

// ── In-memory cache: projectId → { score, expires }
const cache = new Map<string, { score: StartupVitalityScore; expires: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("projectId")
    const refresh = searchParams.get("refresh") === "1"

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    // Cache hit
    if (!refresh) {
      const cached = cache.get(projectId)
      if (cached && cached.expires > Date.now()) {
        return NextResponse.json({ score: cached.score, cached: true })
      }
    }

    // Fetch project + collaborators + latest update
    const supabase = await createClient()
    const { data, error } = await (supabase.from("projects") as any)
      .select(
        `
        *,
        owner:users!projects_owner_id_fkey(*),
        project_collaborators(*, users(*)),
        project_updates(created_at)
      `
      )
      .eq("id", projectId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Verify ownership (only owner can see their SVS)
    if (data.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const project = {
      id: data.id,
      title: data.title,
      description: data.description,
      image: data.image,
      category: data.category,
      status: data.status,
      visibility: data.visibility,
      likes: data.likes || 0,
      views: data.views || 0,
      comments: data.comments || 0,
      tags: data.tags || [],
      progress: data.progress || 0,
      links: (data.links as ProjectLink[]) || [],
      lookingFor: data.looking_for || [],
      ownerId: data.owner_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      collaborators: (data.project_collaborators || []).map((c: any) => ({
        id: c.users?.id,
        name: c.users?.name,
        avatar: c.users?.avatar,
        role: c.role,
      })),
    }

    // Get latest project update date
    const updates: any[] = data.project_updates || []
    const latestUpdate = updates.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    const lastUpdateDate = latestUpdate?.created_at ?? null

    const score = computeStartupVitalityScore(project, lastUpdateDate)

    // Evict stale entries
    if (cache.size > 200) {
      const now = Date.now()
      for (const [key, val] of cache.entries()) {
        if (val.expires < now) cache.delete(key)
      }
    }

    cache.set(projectId, { score, expires: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ score, cached: false })
  } catch (error) {
    console.error("[VitalityScore] Error:", error)
    return NextResponse.json({ error: "Failed to compute vitality score" }, { status: 500 })
  }
}
