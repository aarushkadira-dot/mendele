"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle } from "@/components/ui/icons"
import Link from "next/link"

interface GrowthJourneyProps {
  profileCompleteness: number
}

interface ProfileSection {
  name: string
  link: string
  isComplete: boolean
  percentage: number
}

export const GrowthJourney: React.FC<GrowthJourneyProps> = ({ profileCompleteness }) => {
  const profileSections: ProfileSection[] = [
    {
      name: "Profile Photo",
      link: "/profile#photo",
      isComplete: profileCompleteness >= 20,
      percentage: 20,
    },
    {
      name: "Headline & Bio",
      link: "/profile#headline",
      isComplete: profileCompleteness >= 40,
      percentage: 20,
    },
    {
      name: "Skills & Expertise",
      link: "/profile#skills",
      isComplete: profileCompleteness >= 60,
      percentage: 20,
    },
    {
      name: "Projects & Portfolio",
      link: "/profile#projects",
      isComplete: profileCompleteness >= 80,
      percentage: 20,
    },
    {
      name: "Network & Connections",
      link: "/network",
      isComplete: profileCompleteness === 100,
      percentage: 20,
    },
  ]

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-title">Your Growth Journey</CardTitle>
          <motion.span
            className="text-sm font-semibold text-primary"
            key={profileCompleteness}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
          >
            {profileCompleteness}% complete
          </motion.span>
        </div>
        <Progress value={profileCompleteness} className="mt-4 h-2" />
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {profileSections.map((section, index) => (
            <motion.div
              key={section.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={section.link}
                className="group flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {section.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-success"
                        initial={{ width: 0 }}
                        animate={{ width: section.isComplete ? "100%" : "0%" }}
                        transition={{ duration: 0.8, ease: "easeInOut" }}
                      />
                    </div>
                  </div>
                </div>

                {section.isComplete ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  </motion.div>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
              </Link>
            </motion.div>
          ))}
        </div>

        {profileCompleteness < 100 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20"
          >
            <p className="text-sm text-foreground font-medium">
              {100 - profileCompleteness}% to go!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete the remaining sections to increase visibility and match score with employers.
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}
