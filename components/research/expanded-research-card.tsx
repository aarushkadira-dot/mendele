"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  X,
  MapPin,
  Clock,
  Calendar,
  DollarSign,
  Globe,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  Share2,
  ExternalLink,
  GraduationCap,
  Building,
  ArrowUpRight,
  Mail,
  FlaskConical,
  type LucideIcon,
} from "lucide-react"
import type { Opportunity } from "@/types/opportunity"
import { formatGradeLevels } from "@/types/opportunity"
import { getCompanyLogoUrl } from "@/lib/company-logo"

interface ExpandedResearchCardProps {
  opportunity: Opportunity
  onClose: () => void
  onToggleSave: (id: string) => void
  onGenerateEmail?: (opportunity: Opportunity) => void
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 350,
      damping: 35,
      delay: 0.05,
    },
  },
}

const contentVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 28 },
  },
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon
  label: string
  value: string | null | undefined
  accent?: boolean
}) {
  if (!value) return null
  return (
    <div
      className={`
      relative overflow-hidden rounded-2xl p-4
      ${
        accent
          ? "bg-gradient-to-br from-teal-500/10 to-cyan-500/5 border border-teal-500/20"
          : "bg-muted/50 border border-border/40"
      }
      transition-all duration-200 hover:border-teal-500/30 hover:shadow-sm
    `}
    >
      <div
        className={`
        inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3
        ${accent ? "bg-teal-500/15 text-teal-600 dark:text-teal-400" : "bg-background text-muted-foreground"}
      `}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function ExpandedResearchCard({
  opportunity,
  onClose,
  onToggleSave,
  onGenerateEmail,
}: ExpandedResearchCardProps) {
  const hasDeadline = opportunity.deadline && opportunity.deadline !== "Rolling"
  const isFree = opportunity.cost?.toLowerCase() === "free" || !opportunity.cost
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleEscape)
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = ""
    }
  }, [onClose])

  const logoUrl =
    opportunity.logo ||
    getCompanyLogoUrl(opportunity.institution || opportunity.company) ||
    undefined
  const institution = opportunity.institution || opportunity.company

  if (!mounted) return null

  return createPortal(
    <>
      <motion.div
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100]"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ type: "spring", stiffness: 350, damping: 35 }}
          className="w-full max-w-5xl max-h-[92vh] bg-background rounded-3xl overflow-hidden shadow-2xl flex flex-col pointer-events-auto border border-border/30"
        >
          {/* Hero Header */}
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500 to-cyan-600 opacity-[0.08]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />

            {/* Top Actions */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg border border-border/50 h-10 w-10"
                onClick={() => onToggleSave(opportunity.id)}
              >
                {opportunity.saved ? (
                  <BookmarkCheck className="h-5 w-5 text-teal-500" />
                ) : (
                  <Bookmark className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg border border-border/50 h-10 w-10"
              >
                <Share2 className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg border border-border/50 h-10 w-10"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Header Content */}
            <div className="relative z-10 p-8 sm:p-10 pb-6">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-cyan-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Avatar className="h-24 w-24 rounded-2xl border-4 border-background shadow-2xl relative [image-rendering:crisp-edges]">
                    <AvatarImage src={logoUrl} className="object-cover [image-rendering:crisp-edges]" />
                    <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-teal-500/20 to-cyan-500/10 text-teal-600 dark:text-teal-400 rounded-2xl">
                      {institution[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white border-0 px-3 py-1 shadow-sm">
                      <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
                      Research
                    </Badge>
                    {opportunity.remote && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-700/50 px-3 py-1">
                        <Globe className="h-3.5 w-3.5 mr-1.5" />
                        Remote
                      </Badge>
                    )}
                    {isFree && (
                      <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-700/50 px-3 py-1">
                        Free
                      </Badge>
                    )}
                  </div>

                  <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight tracking-tight">
                    {opportunity.title}
                  </h1>

                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Building className="h-5 w-5" />
                    <span className="text-lg font-medium">{institution}</span>
                    {opportunity.location && (
                      <>
                        <span className="text-border">•</span>
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">{opportunity.location}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col gap-3 sm:items-end shrink-0 w-full sm:w-auto mt-6 sm:mt-10">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto min-w-[200px] h-12 gap-2 text-base font-semibold shadow-lg shadow-teal-500/25 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white"
                    onClick={() => onGenerateEmail?.(opportunity)}
                  >
                    <Mail className="h-5 w-5" />
                    Generate Cold Email
                  </Button>
                  {(opportunity.url || opportunity.applicationUrl) && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto min-w-[200px] h-12 gap-2 text-base font-medium rounded-xl"
                      onClick={() =>
                        window.open(opportunity.url || opportunity.applicationUrl || "", "_blank")
                      }
                    >
                      Visit Program
                      <ArrowUpRight className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <ScrollArea className="flex-1">
            <motion.div
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="p-8 sm:p-10 pt-4 space-y-8"
            >
              {/* Stats Grid */}
              <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  icon={Clock}
                  label="Deadline"
                  value={hasDeadline ? opportunity.deadline : "Rolling"}
                  accent={!!hasDeadline}
                />
                <StatCard
                  icon={MapPin}
                  label="Location"
                  value={
                    opportunity.locationType ||
                    (opportunity.remote ? "Remote" : opportunity.location)
                  }
                />
                <StatCard
                  icon={DollarSign}
                  label="Stipend / Cost"
                  value={opportunity.salary || opportunity.cost || (isFree ? "Free" : null)}
                />
                <StatCard
                  icon={Calendar}
                  label="Duration"
                  value={opportunity.duration || "Not specified"}
                />
              </motion.div>

              {/* AI Match Analysis */}
              {opportunity.matchExplanation && (
                <motion.div
                  variants={itemVariants}
                  className="relative bg-gradient-to-br from-teal-500/5 via-teal-500/3 to-transparent rounded-2xl p-6 border border-teal-500/20"
                >
                  <div className="absolute top-4 right-4 opacity-[0.07]">
                    <Sparkles className="h-32 w-32" />
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Why This Matches You</h3>
                      <p className="text-sm text-muted-foreground">
                        AI-powered analysis based on your interests
                      </p>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-foreground/80 bg-background/60 backdrop-blur-sm p-4 rounded-xl border border-border/40">
                    {opportunity.matchExplanation}
                  </p>
                </motion.div>
              )}

              {/* Main Content Grid */}
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* About */}
                  <motion.div variants={itemVariants} className="space-y-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <div className="w-1 h-6 bg-teal-500 rounded-full" />
                      About this Program
                    </h2>
                    <div className="prose prose-sm prose-gray dark:prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap pl-4">
                      {opportunity.description || "No description available."}
                    </div>
                  </motion.div>

                  {/* Requirements */}
                  {opportunity.requirements && (
                    <motion.div variants={itemVariants} className="space-y-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <div className="w-1 h-6 bg-amber-500 rounded-full" />
                        Requirements & Eligibility
                      </h2>
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {opportunity.requirements}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Research Focus Areas */}
                  {opportunity.researchAreas && opportunity.researchAreas.length > 0 && (
                    <motion.div variants={itemVariants} className="space-y-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <div className="w-1 h-6 bg-cyan-500 rounded-full" />
                        Research Focus Areas
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {opportunity.researchAreas.map((area) => (
                          <Badge
                            key={area}
                            className="px-4 py-2 text-sm font-medium bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/20 text-teal-700 dark:text-teal-300 rounded-xl transition-colors"
                          >
                            {area}
                          </Badge>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Grade Levels */}
                  {opportunity.gradeLevels && opportunity.gradeLevels.length > 0 && (
                    <motion.div
                      variants={itemVariants}
                      className="bg-muted/40 rounded-2xl p-5 border border-border/40"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-background">
                          <GraduationCap className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold">Eligibility</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatGradeLevels(opportunity.gradeLevels)}
                      </p>
                    </motion.div>
                  )}

                  {/* Contact Info */}
                  {opportunity.contactEmail && (
                    <motion.div
                      variants={itemVariants}
                      className="bg-teal-500/5 rounded-2xl p-5 border border-teal-500/20"
                    >
                      <div className="flex items-center gap-3 mb-3 text-teal-600 dark:text-teal-400">
                        <div className="p-2 rounded-lg bg-teal-500/15">
                          <Mail className="h-5 w-5" />
                        </div>
                        <h3 className="font-semibold">Contact</h3>
                      </div>
                      <p className="text-sm text-muted-foreground break-all">
                        {opportunity.contactEmail}
                      </p>
                    </motion.div>
                  )}

                  {/* Stats Footer */}
                  <motion.div
                    variants={itemVariants}
                    className="bg-muted/30 rounded-2xl p-5 border border-border/30 space-y-4"
                  >
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Posted
                      </span>
                      <span className="font-medium">{opportunity.postedDate || "Unknown"}</span>
                    </div>

                    {opportunity.sourceUrl && (
                      <a
                        href={opportunity.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 hover:underline pt-2 font-medium"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View Original Source
                      </a>
                    )}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </ScrollArea>
        </motion.div>
      </div>
    </>,
    document.body
  )
}
