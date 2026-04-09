"use client"

import React from "react"
import { motion } from "framer-motion"
import type { Variants } from "framer-motion"
import { HeroBanner } from "./sections/hero-banner"
import { QuickStatsGrid } from "./sections/quick-stats-grid"
import { GrowthJourney } from "./sections/growth-journey"
import { OpportunitySpotlight } from "./sections/opportunity-spotlight"
import { ActivityTimeline } from "./sections/activity-timeline"
import { RecommendedConnections } from "./sections/recommended-connections"
import { SkillsToLearn } from "./sections/skills-to-learn"
import { UpcomingEvents } from "./sections/upcoming-events"

interface User {
  id: string
  name: string
  email: string
  avatar?: string
  headline?: string
  bio?: string
  skills?: string[]
  interests?: string[]
  connections: number
  completedProjects: number
  profileViews: number
  searchAppearances: number
  profileCompleteness?: number
}

interface Opportunity {
  id: string
  title: string
  company: string
  logo?: string
  description?: string
  skills?: string[]
  matchScore?: number
  matchReasons?: string[]
}

interface Activity {
  id: string
  type: string
  metadata?: any
  date: Date
}

interface NetworklyDashboardProps {
  user: User
  stats: Record<string, any>
  spotlightOpportunity: (Opportunity & { matchScore: number; matchReasons: string[] }) | null
  dailyDigest: {
    unreadMessages: number
    newOpportunities: number
    pendingConnections: number
  }
  recentActivities: Activity[]
  profileCompleteness?: number
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 25,
      stiffness: 300,
    },
  },
}

export const NetworklyDashboard: React.FC<NetworklyDashboardProps> = ({
  user,
  stats,
  spotlightOpportunity,
  dailyDigest,
  recentActivities,
  profileCompleteness = 0,
}) => {
  return (
    <motion.div
      className="section-gap"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Banner */}
      <motion.div variants={itemVariants}>
        <HeroBanner
          user={user}
          profileCompleteness={profileCompleteness}
          dailyDigest={dailyDigest}
        />
      </motion.div>

      {/* Quick Stats Grid */}
      <motion.div variants={itemVariants}>
        <QuickStatsGrid
          profileViews={user.profileViews}
          connections={user.connections}
          opportunities={dailyDigest.newOpportunities}
          growthScore={stats?.growthScore || 85}
        />
      </motion.div>

      {/* Growth Journey Section */}
      <motion.div variants={itemVariants}>
        <GrowthJourney profileCompleteness={profileCompleteness} />
      </motion.div>

      {/* Top Opportunity Match */}
      <motion.div variants={itemVariants}>
        <OpportunitySpotlight opportunity={spotlightOpportunity} />
      </motion.div>

      {/* Two Column Section: Activity + Recommended Connections */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Activity Timeline - 2 columns */}
        <div className="lg:col-span-2">
          <ActivityTimeline activities={recentActivities} />
        </div>

        {/* Recommended Connections - 1 column */}
        <div>
          <RecommendedConnections />
        </div>
      </motion.div>

      {/* Skills and Events Section */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkillsToLearn />
        <UpcomingEvents />
      </motion.div>
    </motion.div>
  )
}
