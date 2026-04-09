"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Bookmark,
  BookmarkCheck,
  Mail,
  ChevronDown,
  ChevronUp,
  Share2,
  Flag,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Check,
} from "@/components/ui/icons"
import { toast } from "sonner"
import { ScoreBreakdown } from "./score-breakdown"
import { EmailDraftModal } from "./email-draft-modal"
import { saveResearcher } from "@/app/actions/researchers"
import type { ScoredProfile, StudentProfile } from "@/types/researcher"

interface ResearcherCardProps {
  profile: ScoredProfile
  isSaved?: boolean
  onSaved?: (name: string) => void
  studentProfile: StudentProfile
  topic: string
}

const TIER_LABELS: Record<string, { label: string; className: string }> = {
  phd_professor: {
    label: "PhD Professor",
    className: "bg-blue-400/10 text-blue-400 dark:text-violet-300 border-blue-400/20",
  },
  postdoc: {
    label: "Postdoc",
    className: "bg-blue-400/10 text-blue-400 dark:text-blue-300 border-blue-400/20",
  },
  grad_student: {
    label: "Grad Student",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  },
  partner_vc: {
    label: "Partner VC",
    className: "bg-blue-400/10 text-blue-400 dark:text-emerald-300 border-blue-400/20",
  },
  angel_investor: {
    label: "Angel Investor",
    className: "bg-blue-400/10 text-blue-400 dark:text-amber-300 border-blue-400/20",
  },
  accelerator: {
    label: "Accelerator",
    className: "bg-blue-400/10 text-blue-400 dark:text-orange-300 border-blue-400/20",
  },
}

function matchColor(score: number) {
  if (score >= 80) return "text-blue-400 dark:text-blue-400"
  if (score >= 65) return "text-blue-400 dark:text-blue-400"
  return "text-blue-400 dark:text-blue-400"
}

function matchBgColor(score: number) {
  if (score >= 80) return "bg-blue-400/10"
  if (score >= 65) return "bg-blue-400/10"
  return "bg-blue-400/10"
}

type FeedbackVote = "up" | "down" | "skip" | null

export function ResearcherCard({
  profile,
  isSaved: initialSaved = false,
  onSaved,
  studentProfile,
  topic,
}: ResearcherCardProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [savingInProgress, setSavingInProgress] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [vote, setVote] = useState<FeedbackVote>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  const tier = TIER_LABELS[profile.profile_tier] ?? { label: profile.profile_tier, className: "" }

  const handleSave = async () => {
    if (saved || savingInProgress) return
    setSavingInProgress(true)
    try {
      await saveResearcher(profile.name, {
        institution: profile.institution,
        overall_match: profile.overall_match,
        profile_tier: profile.profile_tier,
        research_focus: profile.research_focus,
        email_hint: profile.email_hint,
      })
      setSaved(true)
      onSaved?.(profile.name)
      toast.success("Saved to your researchers")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSavingInProgress(false)
    }
  }

  const handleShare = async () => {
    const text = `${profile.name} — ${profile.title}, ${profile.institution}\nMatch: ${profile.overall_match}%\nEmail hint: ${profile.email_hint}`
    await navigator.clipboard.writeText(text)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
    toast.success("Profile copied to clipboard")
  }

  const handleVote = async (v: "up" | "down" | "skip") => {
    if (vote !== null) return
    setVote(v)
    try {
      await fetch("/api/researchers/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName: profile.name, topic, vote: v }),
      })
    } catch {
      // Silently fail — feedback is non-critical
    }
  }

  const handleReport = async (reason: string) => {
    setReportOpen(false)
    try {
      await fetch("/api/researchers/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName: profile.name, topic, vote: "report", reason }),
      })
      toast.success("Thanks for reporting")
    } catch {
      toast.error("Failed to submit report")
    }
  }

  return (
    <>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {/* Header */}
        <div className="p-4 flex items-start gap-3">
          {/* Avatar initial */}
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-lg">
            {profile.name.charAt(0)}
          </div>

          {/* Name + tier */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">{profile.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {profile.title}
              {profile.department ? ` · ${profile.department}` : ""}
            </p>
            <p className="text-xs text-muted-foreground/70 truncate">{profile.institution}</p>
          </div>

          {/* Match score + actions */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div
              className={`flex items-center gap-1 rounded-lg px-2 py-1 ${matchBgColor(profile.overall_match)}`}
            >
              <span className={`text-base font-bold tabular-nums ${matchColor(profile.overall_match)}`}>
                {profile.overall_match}
              </span>
              <span className={`text-[10px] font-medium ${matchColor(profile.overall_match)}`}>%</span>
            </div>
            {/* Save + Share */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleShare}
                title="Copy profile"
              >
                {shareCopied ? (
                  <Check className="h-3.5 w-3.5 text-blue-400" />
                ) : (
                  <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSave}
                disabled={saved || savingInProgress}
                title={saved ? "Saved" : "Save researcher"}
              >
                {saved ? (
                  <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Badges row */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 font-medium border ${tier.className}`}>
            {tier.label}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0 h-5 font-medium border bg-muted/30 text-muted-foreground"
          >
            {profile.engagement_likelihood}% reply rate
          </Badge>
          {profile.years_experience > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0 h-5 font-medium border bg-muted/30 text-muted-foreground"
            >
              ~{profile.years_experience}y exp
            </Badge>
          )}
        </div>

        {/* Research focus */}
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {profile.research_focus}
          </p>
        </div>

        {/* Evidence of student work */}
        {profile.evidence_of_student_work && (
          <div className="mx-4 mb-3 rounded-lg bg-muted/30 border border-border/40 px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
              Student Work Evidence
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {profile.evidence_of_student_work}
            </p>
          </div>
        )}

        {/* Score breakdown (collapsible) */}
        <div className="px-4 pb-3">
          <button
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            Score Breakdown
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <ScoreBreakdown scores={profile.scores} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action bar */}
        <div className="border-t border-border/40 px-4 py-3 flex items-center justify-between gap-2">
          <Button
            size="sm"
            className="gap-1.5 text-xs h-8    hover: hover: text-white"
            onClick={() => setEmailModalOpen(true)}
          >
            <Mail className="h-3.5 w-3.5" />
            Draft Email →
          </Button>

          {/* Feedback */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-1">Helpful?</span>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${vote === "up" ? "text-blue-400 bg-blue-400/10" : "text-muted-foreground"}`}
              onClick={() => handleVote("up")}
              disabled={vote !== null}
              title="Relevant"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${vote === "down" ? "text-blue-400 bg-blue-400/10" : "text-muted-foreground"}`}
              onClick={() => handleVote("down")}
              disabled={vote !== null}
              title="Not relevant"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${vote === "skip" ? "text-muted-foreground bg-muted/50" : "text-muted-foreground"}`}
              onClick={() => handleVote("skip")}
              disabled={vote !== null}
              title="Skip"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>

            {/* Report */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
                onClick={() => setReportOpen((v) => !v)}
                title="Report"
              >
                <Flag className="h-3.5 w-3.5" />
              </Button>
              <AnimatePresence>
                {reportOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-8 right-0 z-20 w-44 rounded-lg border border-border/60 bg-card shadow-lg p-1"
                  >
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded hover:bg-muted/50 transition-colors"
                      onClick={() => handleReport("inaccurate_info")}
                    >
                      Inaccurate info
                    </button>
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded hover:bg-muted/50 transition-colors"
                      onClick={() => handleReport("inappropriate_content")}
                    >
                      Inappropriate content
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <EmailDraftModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        profile={profile}
        studentProfile={studentProfile}
        topic={topic}
      />
    </>
  )
}
