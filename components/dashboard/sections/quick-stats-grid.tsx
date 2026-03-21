"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, Users, Target, TrendingUp } from "@/components/ui/icons"

interface QuickStatsGridProps {
  profileViews: number
  connections: number
  opportunities: number
  growthScore: number
}

const StatCard: React.FC<{
  title: string
  value: number | string
  subtitle: string
  icon: React.ReactNode
}> = ({ title, value, subtitle, icon }) => {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 10 }}
    >
      <Card className="border-border bg-card hover:border-primary/30 transition-colors duration-200">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-3">
              <p className="text-label-sm text-muted-foreground">{title}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground tabular-nums">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </span>
              </div>
              <p className="text-caption text-muted-foreground">{subtitle}</p>
            </div>
            <div className="h-10 w-10 flex items-center justify-center shrink-0 text-primary">
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export const QuickStatsGrid: React.FC<QuickStatsGridProps> = ({
  profileViews,
  connections,
  opportunities,
  growthScore,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Profile Views"
        value={profileViews}
        subtitle="this month"
        icon={<Eye className="h-5 w-5" />}
      />
      <StatCard
        title="Connections"
        value={connections}
        subtitle="professional links"
        icon={<Users className="h-5 w-5" />}
      />
      <StatCard
        title="Opportunities"
        value={opportunities}
        subtitle="AI-matched"
        icon={<Target className="h-5 w-5" />}
      />
      <StatCard
        title="Growth Score"
        value={`${growthScore}/100`}
        subtitle="performance index"
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  )
}
