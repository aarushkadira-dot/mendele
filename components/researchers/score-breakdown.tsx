"use client"

import { motion } from "framer-motion"

interface ScoreBreakdownProps {
  scores: {
    topic_match: number
    student_collaboration: number
    availability: number
    experience_level: number
    trend_alignment: number
  }
}

const DIMENSIONS = [
  { key: "topic_match", label: "Topic Match", weight: "30%" },
  { key: "student_collaboration", label: "Student Collab", weight: "25%" },
  { key: "availability", label: "Availability", weight: "20%" },
  { key: "experience_level", label: "Experience", weight: "15%" },
  { key: "trend_alignment", label: "Trend Fit", weight: "10%" },
] as const

function barColor(score: number) {
  if (score >= 75) return "bg-emerald-500"
  if (score >= 50) return "bg-blue-500"
  return "bg-amber-500"
}

export function ScoreBreakdown({ scores }: ScoreBreakdownProps) {
  return (
    <div className="space-y-2 pt-1">
      {DIMENSIONS.map((dim, i) => {
        const value = scores[dim.key] ?? 0
        return (
          <div key={dim.key} className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {dim.label}{" "}
                <span className="opacity-50">({dim.weight})</span>
              </span>
              <span className="font-medium tabular-nums">{value}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${barColor(value)}`}
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: "easeOut" }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
