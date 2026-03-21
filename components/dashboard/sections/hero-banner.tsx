"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Zap } from "@/components/ui/icons"
import Link from "next/link"

interface HeroBannerProps {
  user: {
    name: string
    headline?: string
    avatar?: string
  }
  profileCompleteness: number
  dailyDigest: {
    unreadMessages: number
    newOpportunities: number
    pendingConnections: number
  }
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  user,
  profileCompleteness,
  dailyDigest,
}) => {
  const firstName = user.name?.split(" ")[0] || "User"

  return (
    <Card className="border-border bg-gradient-to-br from-primary/8 via-card to-card overflow-hidden relative">
      <CardContent className="p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          {/* Left Content */}
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <h1 className="text-display text-foreground">
                Welcome back, <span className="text-primary">{firstName}</span>
              </h1>
              <p className="text-body text-muted-foreground max-w-lg">
                Your professional growth snapshot. Complete your profile to unlock more opportunities
                and increase your visibility among employers.
              </p>
            </div>

            {/* Quick Stats Row */}
            <div className="flex flex-wrap gap-4 pt-2">
              {dailyDigest.newOpportunities > 0 && (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg"
                >
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {dailyDigest.newOpportunities} new opportunities
                  </span>
                </motion.div>
              )}

              {dailyDigest.pendingConnections > 0 && (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-lg"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {dailyDigest.pendingConnections} pending connections
                  </span>
                </motion.div>
              )}
            </div>

            {/* CTA Button */}
            {profileCompleteness < 100 && (
              <Link href="/profile" className="inline-block pt-2">
                <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                  Complete Your Profile
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>

          {/* Right Side - Profile Completion Circle */}
          <motion.div
            className="flex flex-col items-center gap-4"
            whileHover={{ scale: 1.05 }}
          >
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Background circle */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="56"
                  fill="none"
                  stroke="oklch(0.90 0.008 255)"
                  strokeWidth="3"
                />
                {/* Progress circle */}
                <motion.circle
                  cx="60"
                  cy="60"
                  r="56"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - profileCompleteness / 100)}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - profileCompleteness / 100) }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "60px 60px",
                  }}
                />
                <defs>
                  <linearGradient
                    id="progressGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="oklch(0.50 0.19 255)" />
                    <stop offset="100%" stopColor="oklch(0.60 0.17 155)" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center text */}
              <div className="text-center z-10">
                <motion.div
                  key={profileCompleteness}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-3xl font-bold text-foreground"
                >
                  {profileCompleteness}%
                </motion.div>
                <p className="text-xs text-muted-foreground font-medium mt-1">Complete</p>
              </div>
            </div>

            {/* Profile completion status */}
            <div className="text-center space-y-2">
              <Badge
                variant={profileCompleteness === 100 ? "default" : "secondary"}
                className="text-xs"
              >
                {profileCompleteness === 100 ? "✓ Profile Complete" : "Profile Setup"}
              </Badge>
              <p className="text-xs text-muted-foreground max-w-xs">
                {profileCompleteness === 100
                  ? "Great job! Your profile is fully optimized."
                  : `${100 - profileCompleteness}% more to unlock hidden opportunities`}
              </p>
            </div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  )
}
