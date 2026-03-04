"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Lightbulb } from "lucide-react"
import type { Opportunity } from "@/types/opportunity"
import type { InsightPayload } from "@/app/api/opportunities/insight/route"

interface AIInsightCardProps {
  opportunity: Opportunity
}

const insightTypeBadge: Record<
  string,
  { label: string; className: string }
> = {
  eligibility_boost: {
    label: "You Qualify ✓",
    className:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  strategy_tip: {
    label: "Strategy Tip",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  strong_match: {
    label: "Strong Match ✦",
    className:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  },
  stretch_goal: {
    label: "Level Up →",
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
}

export function AIInsightCard({ opportunity }: AIInsightCardProps) {
  const [insight, setInsight] = useState<InsightPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  // Layer 1: skip scholarships entirely
  const isScholarship = opportunity.type?.toLowerCase().includes("scholarship")

  useEffect(() => {
    if (isScholarship || fetched) return

    let cancelled = false
    setLoading(true)
    setFetched(true)

    fetch("/api/opportunities/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: opportunity.id }),
    })
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data?.insight) setInsight(data.insight)
      })
      .catch(() => {
        // Silently fail — this is an enhancement, not core functionality
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [opportunity.id, isScholarship, fetched])

  // Nothing to show
  if (isScholarship) return null

  // Loading skeleton
  if (loading) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2.5 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-amber-500/15" />
          <div className="h-4 w-24 rounded bg-amber-500/15" />
          <div className="h-4 w-16 rounded-full bg-muted/50 ml-auto" />
        </div>
        <div className="h-4 w-3/4 rounded bg-muted/40" />
        <div className="h-3 w-full rounded bg-muted/30" />
        <div className="h-3 w-5/6 rounded bg-muted/30" />
      </div>
    )
  }

  // No insight returned by AI
  if (!insight) return null

  const badge = insightTypeBadge[insight.insight_type] ?? insightTypeBadge.strategy_tip

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/8 via-orange-500/5 to-transparent p-4 space-y-2.5"
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/15 shrink-0">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
            AI Insight
          </span>
          <Badge
            variant="outline"
            className={`ml-auto text-[10px] px-2 py-0 h-5 font-medium border ${badge.className}`}
          >
            {badge.label}
          </Badge>
        </div>

        {/* Headline */}
        <p className="text-sm font-semibold text-foreground leading-snug">
          {insight.headline}
        </p>

        {/* Tip */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {insight.tip}
        </p>
      </motion.div>
    </AnimatePresence>
  )
}
