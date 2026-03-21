"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Briefcase, ArrowRight, Sparkles } from "@/components/ui/icons"
import Link from "next/link"

interface OpportunitySpotlightProps {
  opportunity: {
    id: string
    title: string
    company: string
    logo?: string
    description?: string
    skills?: string[]
    matchScore: number
    matchReasons?: string[]
  } | null
}

export const OpportunitySpotlight: React.FC<OpportunitySpotlightProps> = ({ opportunity }) => {
  if (!opportunity) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-lg bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-title font-semibold text-foreground">
                No opportunities matched yet
              </h3>
              <p className="text-body text-muted-foreground mt-2">
                Complete your profile to unlock AI-matched opportunities tailored to your skills.
              </p>
            </div>
            <Link href="/opportunities" className="inline-block pt-2">
              <Button className="gap-2">
                Explore Opportunities
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </CardContent>
      </Card>
    )
  }

  const matchPercentage = Math.round(opportunity.matchScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-border bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden relative">
        {/* Accent stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-success to-primary" />

        <CardHeader className="pb-6">
          <motion.div
            className="flex items-start justify-between gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-start gap-4 flex-1">
              {opportunity.logo && (
                <Avatar className="h-14 w-14 rounded-lg border border-border">
                  <AvatarImage src={opportunity.logo} alt={opportunity.company} />
                  <AvatarFallback className="rounded-lg font-semibold">
                    {opportunity.company[0]}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className="flex-1 space-y-2">
                <Badge className="bg-primary text-primary-foreground border-none text-label-sm">
                  Top Match
                </Badge>
                <div>
                  <h2 className="text-headline text-foreground font-semibold">
                    {opportunity.title}
                  </h2>
                  <p className="text-body text-muted-foreground">
                    @ <span className="text-primary font-semibold">{opportunity.company}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Match Score Badge */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex flex-col items-center gap-2 px-4 py-3 bg-gradient-to-br from-primary/10 to-success/5 rounded-lg border border-primary/20 shrink-0"
            >
              <div className="flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold text-foreground">{matchPercentage}%</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">Match Score</span>
            </motion.div>
          </motion.div>
        </CardHeader>

        <CardContent className="space-y-6">
          {opportunity.description && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <p className="text-body text-muted-foreground leading-relaxed">
                {opportunity.description}
              </p>
            </motion.div>
          )}

          {/* Match Reasons / Skills */}
          {opportunity.skills && opportunity.skills.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <p className="text-sm font-semibold text-foreground mb-2">Required Skills</p>
              <div className="flex flex-wrap gap-2">
                {opportunity.skills.slice(0, 5).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
                {opportunity.skills.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{opportunity.skills.length - 5} more
                  </Badge>
                )}
              </div>
            </motion.div>
          )}

          {/* Match Reasons */}
          {opportunity.matchReasons && opportunity.matchReasons.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="p-4 rounded-lg bg-success/5 border border-success/20"
            >
              <p className="text-xs font-semibold text-success uppercase tracking-wide mb-2">
                Why You Match
              </p>
              <ul className="space-y-1">
                {opportunity.matchReasons.slice(0, 3).map((reason, idx) => (
                  <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-success mt-0.5">✓</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Action Buttons */}
          <motion.div
            className="flex gap-3 pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Link href={`/opportunities/${opportunity.id}`} className="flex-1">
              <Button className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                <Briefcase className="h-4 w-4" />
                View Opportunity
              </Button>
            </Link>
            <Button variant="outline" className="flex-1">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
