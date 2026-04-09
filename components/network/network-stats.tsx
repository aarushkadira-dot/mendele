"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Users, UserPlus, MessageCircle, TrendingUp, Loader2 } from "@/components/ui/icons"
import { getNetworkStats } from "@/app/actions/connections"

export function NetworkStats() {
  const [stats, setStats] = useState({
    totalConnections: 0,
    pendingRequests: 0,
    unreadMessages: 0,
    profileViews: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await getNetworkStats()
        setStats(data)
      } catch (error) {
        console.error("Failed to fetch network stats:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-center h-14">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const statsArr = [
    {
      label: "Connections",
      value: stats.totalConnections.toString(),
      icon: Users,
    },
    {
      label: "Pending",
      value: stats.pendingRequests.toString(),
      icon: UserPlus,
    },
    {
      label: "Messages",
      value: stats.unreadMessages.toString(),
      icon: MessageCircle,
    },
    {
      label: "Profile Views",
      value: stats.profileViews.toString(),
      icon: TrendingUp,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {statsArr.map((stat) => (
        <Card key={stat.label} className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground tabular-nums">{stat.value}</p>
                <p className="text-caption text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
