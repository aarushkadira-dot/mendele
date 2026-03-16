"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronUp, TrendingUp, Info, Zap } from "lucide-react"
import type { StartupVitalityScore } from "@/lib/business/startup-vitality-score"

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPONENTS = [
  { key: "market_clarity",   label: "Market Clarity",   max: 25, desc: "Market & monetization signals in description" },
  { key: "team_strength",    label: "Team Strength",    max: 20, desc: "Team size and role diversity" },
  { key: "content_signals",  label: "Content Signals",  max: 20, desc: "Pitch deck, website, LinkedIn presence" },
  { key: "stage_score",      label: "Stage Score",      max: 25, desc: "How far along is the startup?" },
  { key: "update_currency",  label: "Update Currency",  max: 10, desc: "Recency of founder activity" },
] as const

const GRADE_CONFIG: Record<string, { color: string; ring: string; label: string }> = {
  A:     { color: "text-blue-400", ring: "stroke-blue-400",       label: "Investor Ready" },
  B:     { color: "text-blue-400",    ring: "stroke-blue-400",          label: "Fundable" },
  C:     { color: "text-blue-400",   ring: "stroke-blue-400",         label: "Early Stage" },
  D:     { color: "text-blue-400",  ring: "stroke-blue-400",        label: "Idea Phase" },
  "N/A": { color: "text-muted-foreground", ring: "stroke-muted-foreground", label: "No Data" },
}

function barColor(pct: number) {
  if (pct >= 0.75) return "bg-blue-400/10"
  if (pct >= 0.50) return "bg-blue-400/10"
  if (pct >= 0.25) return "bg-blue-400/10"
  return "bg-blue-400/10"
}

// ─── Circular Gauge ───────────────────────────────────────────────────────────

function CircularGauge({ score, grade }: { score: number; grade: string }) {
  const r = 52
  const cx = 64
  const cy = 64
  const circumference = 2 * Math.PI * r
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG["N/A"]

  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          strokeWidth={10}
          className="stroke-muted/30"
        />
        <motion.circle
          cx={cx} cy={cy} r={r}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          className={cfg.ring}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-black tabular-nums leading-none ${cfg.color}`}>
          {grade === "N/A" ? "—" : score}
        </span>
        {grade !== "N/A" && (
          <span className="text-[10px] text-muted-foreground font-medium mt-0.5">/ 100</span>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="h-full p-5 space-y-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-32 h-32 rounded-full bg-muted/40" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="h-4 w-28 rounded bg-muted/40" />
          <div className="h-3 w-36 rounded bg-muted/30" />
          <div className="h-3 w-32 rounded bg-muted/30 mt-3" />
        </div>
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-32 rounded bg-muted/30" />
          <div className="h-1.5 w-full rounded-full bg-muted/20" />
        </div>
      ))}
    </div>
  )
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

interface VitalityScoreWidgetProps {
  projectId: string
}

export function VitalityScoreWidget({ projectId }: VitalityScoreWidgetProps) {
  const [data, setData] = useState<StartupVitalityScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const fetchScore = (refresh = false) => {
    setLoading(true)
    setError(false)
    const url = `/api/business/vitality-score?projectId=${projectId}${refresh ? "&refresh=1" : ""}`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Failed")
        return r.json()
      })
      .then((d) => setData(d.score))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchScore()
  }, [projectId])

  if (loading) return <Skeleton />

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-5 text-center gap-2">
        <Zap className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Couldn't load Vitality Score</p>
      </div>
    )
  }

  const cfg = GRADE_CONFIG[data.grade] ?? GRADE_CONFIG["N/A"]
  const components = data.components

  return (
    <div className="h-full flex flex-col p-5 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold">Startup Vitality Score</span>
        </div>
        <button
          onClick={() => setInfoOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="What is this?"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {/* Info popover */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-lg bg-muted/40 border border-border/40 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed"
          >
            The <span className="font-semibold text-foreground">Startup Vitality Score</span> measures
            how investor-ready your startup profile is across five dimensions — market clarity, team
            strength, credibility artifacts, stage progress, and founder activity.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gauge + Grade */}
      <div className="flex items-center gap-4">
        <CircularGauge score={data.total} grade={data.grade} />

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-black ${cfg.color}`}>{data.grade}</span>
            <span className="text-sm text-muted-foreground">{cfg.label}</span>
          </div>

          {data.insights.length > 0 && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-3">
              {data.insights[0]}
            </p>
          )}
        </div>
      </div>

      {/* Component breakdown bars */}
      <div className="space-y-2.5">
        {COMPONENTS.map((dim, i) => {
          const raw = components[dim.key]
          const pct = raw / dim.max
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">{dim.label}</span>
                <span className="text-[11px] font-semibold tabular-nums">
                  {raw.toFixed(0)}{" "}
                  <span className="font-normal text-muted-foreground/60">/ {dim.max}</span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${barColor(pct)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.07, ease: "easeOut" }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Improvement tips (collapsible) */}
      {data.improvement_tips.length > 0 && (
        <div className="border-t border-border/40 pt-3">
          <button
            className="flex items-center justify-between w-full text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setTipsOpen((v) => !v)}
          >
            How to improve your score
            {tipsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <AnimatePresence>
            {tipsOpen && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-2 space-y-1.5"
              >
                {data.improvement_tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className="text-primary mt-0.5 shrink-0">→</span>
                    {tip}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Refresh link */}
      <button
        onClick={() => fetchScore(true)}
        className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-auto"
      >
        Refresh score
      </button>
    </div>
  )
}
