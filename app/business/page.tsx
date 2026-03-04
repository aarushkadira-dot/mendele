import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/server"
import { getMyStartupProject, getDiscoverStartups, getBusinessStudentProfile } from "@/app/actions/business"
import { BusinessClient } from "./business-client"

export default async function BusinessPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  // Parallel fetch all data needed for the page
  const [userProject, discoverProjects, studentProfile] = await Promise.all([
    getMyStartupProject(),
    getDiscoverStartups(24),
    getBusinessStudentProfile(),
  ])

  return (
    <BusinessClient
      userProject={userProject}
      discoverProjects={discoverProjects}
      studentProfile={studentProfile}
    />
  )
}
