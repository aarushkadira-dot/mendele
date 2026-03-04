"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Users,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { StartupFeedback } from "@/app/api/business/feedback/route"

// ─── Dimension bar ────────────────────────────────────────────────────────────

function DimensionBar({
  label,
  score,
  explanation,
  dimLabel,
  index,
}: {
  label: string
  score: number
  explanation: string
  dimLabel: string
  index: number
}) {
  const color =
    score >= 75 ? "bg-emerald-500"
    : score >= 55 ? "bg-blue-500"
    : score >= 35 ? "bg-amber-500"
    : "bg-orange-500"

  const textColor =
    score >= 75 ? "text-emerald-500"
    : score >= 55 ? "text-blue-500"
    : score >= 35 ? "text-amber-500"
    : "text-orange-500"

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${textColor} border-current/30`}>
            {dimLabel}
          </Badge>
          <span className={`text-sm font-bold tabular-nums ${textColor}`}>{score}</span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden mb-1.5">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, delay: index * 0.08, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{explanation}</p>
    </div>
  )
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 38
  const circumference = 2 * Math.PI * r
  const color =
    score >= 75 ? "stroke-emerald-400"
    : score >= 55 ? "stroke-blue-400"
    : score >= 35 ? "stroke-amber-400"
    : "stroke-orange-400"

  const textColor =
    score >= 75 ? "text-emerald-400"
    : score >= 55 ? "text-blue-400"
    : score >= 35 ? "text-amber-400"
    : "text-orange-400"

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
        <circle cx={48} cy={48} r={r} fill="none" strokeWidth={8} className="stroke-muted/30" />
        <motion.circle
          cx={48} cy={48} r={r}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          className={color}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black leading-none ${textColor}`}>{score}</span>
        <span className="text-[9px] text-muted-foreground">/100</span>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface FeedbackPanelProps {
  projectId: string
  projectTitle: string
}

export function FeedbackPanel({ projectId, projectTitle }: FeedbackPanelProps) {
  const [feedback, setFeedback] = useState<StartupFeedback | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const runFeedback = async (refresh = false) => {
    setLoading(true)
    setError(null)
    setOpen(true)

    try {
      const res = await fetch("/api/business/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, refresh }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to generate feedback")
      }

      const data = await res.json()
      setFeedback(data.feedback)
    } catch (err: any) {
      setError(err.message || "Failed to generate feedback. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const DIMENSIONS = [
    { key: "market_opportunity", label: "Market Opportunity" },
    { key: "product_clarity", label: "Product Clarity" },
    { key: "team_execution", label: "Team Execution" },
    { key: "traction_signals", label: "Traction Signals" },
    { key: "investor_readiness", label: "Investor Readiness" },
  ] as const

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* Header / trigger */}
      <button
        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/20 transition-colors"
        onClick={() => {
          if (!feedback && !loading) runFeedback()
          else setOpen((v) => !v)
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10">
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <p className="font-semibold text-sm">AI Investor Feedback</p>
            <p className="text-xs text-muted-foreground">
              {feedback ? `Overall score: ${feedback.overall_score}/100` : "VC-style due diligence analysis"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!feedback && !loading && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs pointer-events-none"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Get Feedback
            </Button>
          )}
          {(feedback || loading) && (
            open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5 border-t border-border/40">

              {/* Loading */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing {projectTitle} as a VC would…
                  </p>
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => runFeedback(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              )}

              {/* Feedback results */}
              {!loading && feedback && (
                <div className="pt-4 space-y-6">
                  {/* Overall score + summary */}
                  <div className="flex items-start gap-4">
                    <ScoreRing score={feedback.overall_score} />
                    <div className="flex-1 space-y-1.5">
                      <p className="text-sm font-semibold">VC Assessment</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {feedback.summary}
                      </p>
                    </div>
                  </div>

                  {/* Dimension bars */}
                  <div className="space-y-4">
                    <p className="text-sm font-semibold">Dimension Breakdown</p>
                    {DIMENSIONS.map((dim, i) => {
                      const d = feedback.dimensions[dim.key]
                      return (
                        <DimensionBar
                          key={dim.key}
                          label={dim.label}
                          score={d.score}
                          explanation={d.explanation}
                          dimLabel={d.label}
                          index={i}
                        />
                      )
                    })}
                  </div>

                  {/* Strengths + Gaps */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Strengths
                      </p>
                      <ul className="space-y-1.5">
                        {feedback.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Critical Gaps
                      </p>
                      <ul className="space-y-1.5">
                        {feedback.critical_gaps.map((g, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                            {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Next milestone */}
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1.5">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      Priority Next Step
                    </p>
                    <p className="text-sm text-muted-foreground">{feedback.next_milestone}</p>
                  </div>

                  {/* Investor fit */}
                  {feedback.investor_fit.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-primary" />
                        Best Investor Fit
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {feedback.investor_fit.map((fit, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {fit}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pitch improvements */}
                  {feedback.pitch_improvements.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Pitch Improvements</p>
                      <ul className="space-y-1.5">
                        {feedback.pitch_improvements.map((tip, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">→</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Regenerate */}
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-xs text-muted-foreground"
                      onClick={() => runFeedback(true)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
