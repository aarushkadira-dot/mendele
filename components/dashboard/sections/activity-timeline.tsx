"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Clock,
  Briefcase,
  UserPlus,
  FileText,
  CheckCircle2,
  MessageCircle,
  Eye,
} from "@/components/ui/icons"
import Link from "next/link"

interface Activity {
  id: string
  type: string
  metadata?: {
    title?: string
    description?: string
    actor?: string
  }
  date: Date
}

interface ActivityTimelineProps {
  activities?: Activity[]
}

const activityIcons: Record<string, React.ReactNode> = {
  application: <Briefcase className="h-4 w-4" />,
  connection: <UserPlus className="h-4 w-4" />,
  profile: <FileText className="h-4 w-4" />,
  opportunity: <CheckCircle2 className="h-4 w-4" />,
  message: <MessageCircle className="h-4 w-4" />,
  profile_view: <Eye className="h-4 w-4" />,
}

const activityColors: Record<string, string> = {
  application: "bg-blue-500/20 text-blue-600",
  connection: "bg-green-500/20 text-green-600",
  profile: "bg-purple-500/20 text-purple-600",
  opportunity: "bg-amber-500/20 text-amber-600",
  message: "bg-pink-500/20 text-pink-600",
  profile_view: "bg-cyan-500/20 text-cyan-600",
}

function getActivityTitle(activity: Activity): string {
  if (activity.metadata?.title) {
    return activity.metadata.title
  }

  const titles: Record<string, string> = {
    application: "Applied to opportunity",
    connection: "New connection",
    profile: "Updated profile",
    opportunity: "Saved opportunity",
    message: "Received message",
    profile_view: "Profile viewed",
  }

  return titles[activity.type] || "Activity recorded"
}

function formatTimeAgo(date: Date): string {
  const diff = (new Date().getTime() - new Date(date).getTime()) / 1000
  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(date).toLocaleDateString()
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ activities = [] }) => {
  const hasActivities = activities && activities.length > 0

  return (
    <Card className="border-border bg-card flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-4 shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Network Activity
        </CardTitle>
        <p className="text-caption text-muted-foreground mt-1">Recent milestones and interactions</p>
      </CardHeader>

      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          {!hasActivities ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-64 text-center px-6 py-12"
            >
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-lg bg-muted mb-3">
                <Clock className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                Start exploring opportunities and connecting with other students
              </p>
            </motion.div>
          ) : (
            <div className="p-4 space-y-4">
              {activities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative flex gap-4 group"
                >
                  {/* Timeline line */}
                  {index < activities.length - 1 && (
                    <div className="absolute left-[15px] top-10 bottom-0 w-px bg-border" />
                  )}

                  {/* Icon circle */}
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full shrink-0 border-2 border-card ${
                      activityColors[activity.type] || "bg-muted text-muted-foreground"
                    }`}
                  >
                    {activityIcons[activity.type] || <Clock className="h-4 w-4" />}
                  </motion.div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-sm font-medium text-foreground">
                      {getActivityTitle(activity)}
                    </p>
                    {activity.metadata?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {activity.metadata.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-1.5 font-medium uppercase tracking-wide">
                      {formatTimeAgo(activity.date)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {hasActivities && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t border-border p-3 shrink-0"
          >
            <Link href="/network" className="text-center block">
              <p className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                View all activity →
              </p>
            </Link>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}
