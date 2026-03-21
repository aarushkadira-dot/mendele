"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, Eye, TrendingUp, Zap, ArrowUpRight } from "@/components/ui/icons"

interface StatsCardsProps {
  connections: number
  views: number
  strength: number
  growth?: number
}

export function StatsCards({ connections, views, strength, growth = 0 }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="border-border bg-card">
        <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
          <div className="flex justify-between items-start">
            <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{connections}</div>
            <div className="text-caption text-muted-foreground">Connections</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
            <Eye className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{views}</div>
            <div className="text-caption text-muted-foreground">Profile Views</div>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-2 border-border bg-card">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-label-sm text-muted-foreground">Profile Strength</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {strength}%
              </span>
              <span className="text-caption text-muted-foreground">Keep it up!</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
