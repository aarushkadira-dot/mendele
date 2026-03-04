"use server"

import { createClient, getCurrentUser } from "@/lib/supabase/server"
import type { ScoredProfile } from "@/types/researcher"

export async function saveResearcher(
  profileName: string,
  metadata: {
    institution: string
    overall_match: number
    profile_tier: string
    research_focus: string
    email_hint: string
  }
) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) throw new Error("Unauthorized")

  const { error } = await (supabase.from("user_activities").insert as Function)({
    user_id: user.id,
    type: "saved_researcher",
    metadata: {
      profile_name: profileName,
      institution: metadata.institution,
      overall_match: metadata.overall_match,
      profile_tier: metadata.profile_tier,
      research_focus: metadata.research_focus,
      email_hint: metadata.email_hint,
    },
  })

  if (error) {
    console.error("[saveResearcher] Error:", error)
    throw new Error("Failed to save researcher")
  }

  return { success: true }
}

export async function getSavedResearchers(): Promise<Partial<ScoredProfile>[]> {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) return []

  const { data: activities } = await supabase
    .from("user_activities")
    .select("metadata")
    .eq("user_id", user.id)
    .eq("type", "saved_researcher")
    .order("date", { ascending: false })

  if (!activities) return []

  return activities.map((a: unknown) => {
    const activity = a as { metadata?: Record<string, unknown> }
    const m = activity.metadata || {}
    return {
      name: (m.profile_name as string) || "Unknown",
      institution: (m.institution as string) || "",
      overall_match: (m.overall_match as number) || 0,
      profile_tier: (m.profile_tier as ScoredProfile["profile_tier"]) || "phd_professor",
      research_focus: (m.research_focus as string) || "",
      email_hint: (m.email_hint as string) || "",
    }
  })
}

export async function submitFeedback(
  profileName: string,
  topic: string,
  vote: "up" | "down" | "skip" | "report",
  reason?: string
) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) throw new Error("Unauthorized")

  const { error } = await (supabase.from("user_activities").insert as Function)({
    user_id: user.id,
    type: "researcher_feedback",
    metadata: {
      profile_name: profileName,
      topic,
      vote,
      ...(reason ? { reason } : {}),
    },
  })

  if (error) {
    console.error("[submitFeedback] Error:", error)
    throw new Error("Failed to submit feedback")
  }

  return { success: true }
}
