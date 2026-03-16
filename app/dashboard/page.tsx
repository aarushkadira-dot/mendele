export const dynamic = "force-dynamic"

import { SalesDashboard } from "@/components/ui/live-sales-dashboard"
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

    // Retry fetching dashboard data
    data = await getDashboardData()

    // If still failing, show error state
    if (!data) {
      return (
        <div className="space-y-6 container mx-auto px-4 sm:px-6 max-w-7xl py-6">
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <h2 className="text-xl font-semibold text-destructive">Failed to set up account</h2>
            <p className="text-muted-foreground text-center max-w-xs">
              Please try refreshing the page or contact support.
            </p>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 max-w-7xl py-10">
      <SalesDashboard 
        user={data.user} 
        stats={data.user} // The data.user object in my mock has profileViews etc. 
        activities={data.recentActivities} 
      />
    </div>
  )
}
