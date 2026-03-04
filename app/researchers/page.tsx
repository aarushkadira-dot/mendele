import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { ResearchersClient } from "./researchers-client"
import type { StudentProfile } from "@/types/researcher"

export default async function ResearchersPage() {
  const user = await getCurrentUser()

  let studentProfile: StudentProfile = {
    name: "A student",
    grade: "high school",
    interests: "",
    skills: "",
    achievements: "",
  }

  if (user) {
    try {
      const supabase = await createClient()
      const [userResult, profileResult, achievementsResult] = await Promise.all([
        (supabase.from("users") as any)
          .select("name,skills,interests")
          .eq("id", user.id)
          .single(),
        (supabase.from("user_profiles") as any)
          .select("grade_level")
          .eq("user_id", user.id)
          .single(),
        (supabase.from("achievements") as any)
          .select("title,description")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ])

      const userData = userResult.data || {}
      const profileData = profileResult.data || {}
      const achievements: any[] = achievementsResult.data || []

      studentProfile = {
        name: userData.name || "A student",
        grade: profileData.grade_level ? `${profileData.grade_level}th grade` : "high school",
        interests: (userData.interests || []).join(", "),
        skills: (userData.skills || []).join(", "),
        achievements:
          achievements.length > 0
            ? achievements.map((a: any) => `${a.title}: ${a.description || ""}`).join("; ")
            : "",
      }
    } catch {
      // Use defaults if fetch fails
    }
  }

  return <ResearchersClient studentProfile={studentProfile} />
}
