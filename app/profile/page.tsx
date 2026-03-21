export const dynamic = "force-dynamic"

import { ProfileHeader } from "@/components/profile/profile-header"
import { AboutSection } from "@/components/profile/about-section"
import { SkillsSection } from "@/components/profile/skills-section"
import { RecommendationsSection } from "@/components/profile/recommendations-section"
import { ProfileDetailsSection } from "@/components/profile/profile-details-section"
import { ProfileSidebar } from "@/components/profile/profile-sidebar"
import { GoalsTracker } from "@/components/profile/goals-tracker"
import { ProfileTimeline } from "@/components/profile/profile-timeline"
import { SkillsRadar } from "@/components/profile/skills-radar"
import { StatsCards } from "@/components/profile/stats-cards"
import { getCurrentUser, getUserAnalytics, getUserProfile } from "@/app/actions/user"
import { calculateProfileStrength } from "@/app/actions/profile"
import { getRecommendations } from "@/app/actions/recommendations"
import { Card } from "@/components/ui/card"

export default async function ProfilePage() {
  const [user, analytics, recommendations, userProfile] = await Promise.all([
    getCurrentUser(),
    getUserAnalytics(),
    getRecommendations(),
    getUserProfile(),
  ])

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-title text-foreground mb-2">User not found</h2>
          <p className="text-body-sm text-muted-foreground">Please try refreshing the page</p>
        </div>
      </div>
    )
  }

  const profileStrength = await calculateProfileStrength(user.id)
  const skillEndorsements = analytics?.skillEndorsements || []

  return (
    <div className="page-container">
      <div className="section-gap">
        {/* Header */}
        <div className="overflow-hidden">
          <ProfileHeader user={user} userProfile={userProfile} />
        </div>

        {/* Bento Grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            <AboutSection bio={user.bio} />
            <ProfileDetailsSection userProfile={userProfile} />
            <ProfileTimeline
              achievements={user.achievements}
              extracurriculars={user.extracurriculars}
            />
            <RecommendationsSection recommendations={recommendations} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <StatsCards
              connections={user.connections}
              views={user.profileViews}
              strength={profileStrength}
              growth={12}
            />
            <GoalsTracker />
            <SkillsRadar skills={user.skills} endorsements={skillEndorsements} />
            <SkillsSection
              skills={user.skills}
              interests={user.interests}
              skillEndorsements={skillEndorsements}
            />

            <ProfileSidebar
              showStrength={false}
              profileStrength={profileStrength}
              linkedinUrl={user.linkedinUrl}
              githubUrl={user.githubUrl}
              portfolioUrl={user.portfolioUrl}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
