export const dynamic = "force-dynamic"

import { NetworklyDashboard } from "@/components/dashboard/networkly-dashboard"
import { getDashboardData } from "@/app/actions/dashboard"
import { redirect } from "next/navigation"
import { ensureUserRecord } from "@/app/actions/user"

export default async function DashboardPage() {
  let data = await getDashboardData()

  if (!data) {
    const ensuredUser = await ensureUserRecord()
    if (!ensuredUser) {
      redirect("/login")
    }

    data = await getDashboardData()

    if (!data) {
      return (
        <div className="page-container">
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
            <h2 className="text-title text-destructive">Failed to set up account</h2>
            <p className="text-body-sm text-muted-foreground text-center max-w-xs">
              Please try refreshing the page or contact support.
            </p>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="page-container">
      <NetworklyDashboard
        user={data.user}
        stats={data.stats || {}}
        spotlightOpportunity={data.spotlightOpportunity || null}
        dailyDigest={data.dailyDigest}
        recentActivities={data.recentActivities}
        profileCompleteness={data.user.profileCompleteness}
      />
    </div>
  )
}
