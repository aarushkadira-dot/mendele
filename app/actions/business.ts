"use server"

import { revalidatePath } from "next/cache"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import type { ProjectLink } from "@/lib/projects"

// ─── Types ────────────────────────────────────────────────────────────────────

function transformProject(project: any) {
  return {
    id: project.id as string,
    title: project.title as string,
    description: project.description as string,
    image: project.image as string | null,
    category: project.category as string,
    status: project.status as string,
    visibility: project.visibility as string,
    likes: (project.likes as number) || 0,
    views: (project.views as number) || 0,
    comments: (project.comments as number) || 0,
    tags: (project.tags as string[]) || [],
    progress: (project.progress as number) || 0,
    links: (project.links as ProjectLink[]) || [],
    lookingFor: (project.looking_for as string[]) || [],
    ownerId: project.owner_id as string,
    ownerName: project.owner?.name as string | undefined,
    ownerAvatar: project.owner?.avatar as string | null | undefined,
    createdAt: project.created_at as string,
    updatedAt: project.updated_at as string,
    collaborators:
      project.project_collaborators?.map((c: any) => ({
        id: c.users?.id,
        name: c.users?.name,
        avatar: c.users?.avatar,
        role: c.role,
      })) || [],
    // Latest update date for SVS computation
    lastUpdateDate: project.project_updates?.[0]?.created_at ?? null,
  }
}

// ─── Get Current User's Startup Project ──────────────────────────────────────

export async function getMyStartupProject() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await (supabase.from("projects") as any)
    .select(
      `
      *,
      owner:users!projects_owner_id_fkey(*),
      project_collaborators(*, users(*)),
      project_updates(created_at)
    `
    )
    .eq("owner_id", user.id)
    .eq("category", "business")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return transformProject(data)
}

// ─── Get Public Business Projects (Discover Tab) ──────────────────────────────

export async function getDiscoverStartups(limit = 24) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  let query = (supabase.from("projects") as any)
    .select(
      `
      *,
      owner:users!projects_owner_id_fkey(*),
      project_collaborators(*, users(*)),
      project_updates(created_at)
    `
    )
    .eq("visibility", "public")
    .eq("category", "business")
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (user) {
    query = query.neq("owner_id", user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error("[getDiscoverStartups]", error)
    return []
  }

  return ((data || []) as any[]).map(transformProject)
}

// ─── Upsert Startup Project ───────────────────────────────────────────────────

export async function upsertStartupProject(input: {
  id?: string // if provided, update; otherwise create
  title: string
  description: string
  status: string
  visibility: string
  tags: string[]
  links: ProjectLink[]
  progress?: number
}) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated")

  const payload: Record<string, any> = {
    title: input.title,
    description: input.description,
    category: "business",
    status: input.status,
    visibility: input.visibility,
    tags: input.tags,
    links: input.links as unknown as Record<string, unknown>[],
    looking_for: [],
    progress: input.progress ?? 0,
    owner_id: user.id,
  }

  if (input.id) {
    // Update
    const { data, error } = await (supabase.from("projects") as any)
      .update(payload)
      .eq("id", input.id)
      .eq("owner_id", user.id)
      .select(
        `
        *,
        owner:users!projects_owner_id_fkey(*),
        project_collaborators(*, users(*)),
        project_updates(created_at)
      `
      )
      .single()

    if (error) {
      console.error("[upsertStartupProject/update]", error)
      throw new Error("Failed to update startup")
    }

    // Add a project update log entry
    await (supabase.from("project_updates") as any).insert({
      project_id: input.id,
      type: "update",
      content: "Startup profile updated",
    })

    revalidatePath("/business")
    return { success: true, project: transformProject(data) }
  } else {
    // Create
    const { data, error } = await (supabase.from("projects") as any)
      .insert(payload)
      .select(
        `
        *,
        owner:users!projects_owner_id_fkey(*),
        project_collaborators(*, users(*)),
        project_updates(created_at)
      `
      )
      .single()

    if (error) {
      console.error("[upsertStartupProject/create]", error)
      throw new Error("Failed to create startup")
    }

    // Auto-add owner as collaborator
    await (supabase.from("project_collaborators") as any).insert({
      project_id: data.id,
      user_id: user.id,
      role: "Founder",
    })

    // Log creation
    await (supabase.from("project_updates") as any).insert({
      project_id: data.id,
      type: "milestone",
      content: `Startup "${data.title}" was created`,
    })

    revalidatePath("/business")
    return { success: true, project: transformProject(data) }
  }
}

// ─── Get Student Profile (for investor search context) ───────────────────────

export async function getBusinessStudentProfile() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const [userResult, profileResult] = await Promise.all([
    (supabase.from("users") as any)
      .select("name, skills, interests")
      .eq("id", user.id)
      .single(),
    (supabase.from("user_profiles") as any)
      .select("grade_level")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const userData = userResult.data || {}
  const profileData = profileResult.data || {}

  return {
    name: (userData.name as string) || "A student",
    grade: profileData.grade_level ? `${profileData.grade_level}th grade` : "high school",
    interests: ((userData.interests as string[]) || []).join(", "),
    skills: ((userData.skills as string[]) || []).join(", "),
    achievements: "",
  }
}
