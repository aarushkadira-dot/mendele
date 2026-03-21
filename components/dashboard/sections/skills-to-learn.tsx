"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { BookOpen, Star } from "@/components/ui/icons"
import Link from "next/link"

interface Skill {
  name: string
  proficiency: number
  relevance: number
  category: string
}

interface SkillsToLearnProps {
  skills?: Skill[]
}

// Mock data - in production this would come from an API
const mockSkills: Skill[] = [
  { name: "React", proficiency: 65, relevance: 95, category: "Frontend" },
  { name: "TypeScript", proficiency: 45, relevance: 90, category: "Language" },
  { name: "UI/UX Design", proficiency: 55, relevance: 85, category: "Design" },
  { name: "Data Structures", proficiency: 70, relevance: 80, category: "CS Fundamentals" },
]

export const SkillsToLearn: React.FC<SkillsToLearnProps> = ({ skills = mockSkills }) => {
  return (
    <Card className="border-border bg-card flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Skills to Develop
        </CardTitle>
        <p className="text-caption text-muted-foreground mt-1">
          Recommended skills for your matched opportunities
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
        {skills.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center flex-1 text-center px-4"
          >
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-muted mb-2">
              <BookOpen className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">No skills recommended yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Complete your profile to unlock skill recommendations
            </p>
          </motion.div>
        ) : (
          skills.map((skill, index) => (
            <motion.div
              key={skill.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group p-3 rounded-lg border border-border hover:border-primary/30 bg-card hover:bg-accent/50 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {skill.name}
                  </h4>
                  <Badge variant="outline" className="mt-1 text-[10px] py-0 px-1.5">
                    {skill.category}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 mb-1">
                    <Star className="h-3 w-3 fill-current" />
                    {skill.relevance}%
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">Relevance</p>
                </div>
              </div>

              {/* Proficiency Progress */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Proficiency</p>
                  <p className="text-xs font-semibold text-foreground">{skill.proficiency}%</p>
                </div>
                <Progress value={skill.proficiency} className="h-1.5" />
              </div>

              {/* Learn Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-3 w-full py-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors rounded border border-primary/20 hover:bg-primary/5"
              >
                Find Courses
              </motion.button>
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
