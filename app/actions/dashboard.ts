"use server"

import { createClient, getCurrentUser, isDev } from "@/lib/supabase/server"
import type { User, Opportunity, UserOpportunity } from "@/lib/types"
import { getAnalyticsSummary } from "./analytics"

export async function getDashboardData() {
  const supabase = await createClient()
  const [authUser, stats] = await Promise.all([getCurrentUser(), getAnalyticsSummary()])

  if (!authUser || !stats) {
    return null
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single()


  const user = userData as User | null

  if (userError || !user) {
    if (isDev() || userError?.message === 'Supabase not configured') {
      // Return mock data for dev if supabase is missing or user not found
      return {
        user: {
          id: authUser.id,
          name: (authUser as any).user_metadata?.full_name || authUser.email?.split('@')[0] || "User",
          email: authUser.email || "",
          avatar: (authUser as any).user_metadata?.avatar_url || null,
          headline: "High School Student",
          bio: "",
          skills: [],
          interests: [],
          connections: 12,
          completedProjects: 2,
          profileViews: 45,
          searchAppearances: 8,
          profileCompleteness: 65,
        },
        dailyDigest: {
          unreadMessages: 3,
          newOpportunities: 12,
          pendingConnections: 4,
        },
        stats: stats || {},
        spotlightOpportunity: null,
        recentActivities: [],
      } as any
    }
    return null
  }

  const { count: unreadMessages } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("receiver_id", user.id)
    .eq("unread", true)

  const { count: pendingConnections } = await supabase
    .from("connections")
    .select("*", { count: "exact", head: true })
    .eq("receiver_id", user.id)
    .eq("status", "pending")

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const { count: newOpportunities } = await supabase
    .from("opportunities")
    .select("*", { count: "exact", head: true })
    .gte("created_at", oneWeekAgo.toISOString())
    .eq("is_active", true)

  const { data: userOppsData } = await supabase
    .from("user_opportunities")
    .select(
      `
      *,
      opportunities(*)
    `
    )
    .eq("user_id", user.id)
    .order("match_score", { ascending: false })
    .limit(10)

  const userOpportunities = userOppsData as any[] | null

  const topMatch = userOpportunities?.find(
    (uo: any) => uo.opportunities?.is_active && !uo.opportunities?.is_expired
  )

  let spotlightOpportunity = null
  if (topMatch?.opportunities) {
    let matchReasons: string[] = []
    try {
      if (typeof topMatch.match_reasons === "string") {
        matchReasons = JSON.parse(topMatch.match_reasons)
      } else if (Array.isArray(topMatch.match_reasons)) {
        matchReasons = topMatch.match_reasons as string[]
      }
    } catch {
      matchReasons = ["Based on your profile skills"]
    }

    spotlightOpportunity = {
      ...topMatch.opportunities,
      matchScore: topMatch.match_score,
      matchReasons,
    }
  } else {
    const { data: recentOppData } = await supabase
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .eq("is_expired", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    const recentOpp = recentOppData as Opportunity | null

    if (recentOpp) {
      spotlightOpportunity = {
        ...recentOpp,
        matchScore: 0,
        matchReasons: ["New opportunity"],
      }
    }
  }

  let profileScore = 0
  if (user.avatar) profileScore += 10
  if (user.headline) profileScore += 10
  if (user.bio) profileScore += 20
  const skills = user.skills as string[] | null
  if (skills && skills.length > 0) profileScore += 20
  if ((user.completed_projects || 0) > 0) profileScore += 20
  if ((user.connections || 0) > 0) profileScore += 20

  const profileCompleteness = Math.min(profileScore, 100)

  const { data: recentActivities } = await supabase
    .from("user_activities")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(10)

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      headline: user.headline,
      bio: user.bio,
      skills: user.skills,
      interests: user.interests,
      connections: user.connections,
      completedProjects: user.completed_projects,
      profileViews: user.profile_views,
      searchAppearances: user.search_appearances,
      profileCompleteness,
    },
    dailyDigest: {
      unreadMessages: unreadMessages || 0,
      newOpportunities: newOpportunities || 0,
      pendingConnections: pendingConnections || 0,
    },
    stats,
    spotlightOpportunity,
    recentActivities: recentActivities || [],
  }
}
