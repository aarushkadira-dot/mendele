"use client"

import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  MapPin,
  Calendar,
  Globe,
  GraduationCap,
  Bookmark,
  BookmarkCheck,
  Mail,
  Sparkles,
  FlaskConical,
  DollarSign,
} from "@/components/ui/icons"
import type { Opportunity } from "@/types/opportunity"
import { formatGradeLevels } from "@/types/opportunity"
import { getCompanyLogoUrl } from "@/lib/company-logo"

interface ResearchCardProps {
  opportunity: Opportunity
  relevanceScore?: number
  isSelected: boolean
  onSelect: (opportunity: Opportunity) => void
  onToggleSave: (e: React.MouseEvent, id: string) => void
  onGenerateEmail?: (e: React.MouseEvent, opportunity: Opportunity) => void
  saving?: boolean
}

const cardSpring = {
  type: "spring" as const,
  stiffness: 260,
  damping: 30,
}

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: cardSpring,
  },
}

export function ResearchCard({
  opportunity,
  relevanceScore,
  isSelected,
  onSelect,
  onToggleSave,
  onGenerateEmail,
  saving = false,
}: ResearchCardProps) {
  const hasDeadline = opportunity.deadline && opportunity.deadline !== "Rolling"
  const isFree = opportunity.cost?.toLowerCase() === "free" || !opportunity.cost
  const score = relevanceScore ?? opportunity.matchScore ?? 0

  return (
    <motion.div
      variants={itemVariants}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full cursor-pointer group"
      onClick={() => onSelect(opportunity)}
    >
      <motion.div
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="h-full"
      >
        <Card
          className={`
            relative h-full overflow-hidden border-border/50
            transition-shadow duration-300 ease-out
            hover:shadow-xl hover:shadow-blue-400/5 hover:border-blue-400/20
            ${
              isSelected
                ? "ring-2 ring-teal-500 border-blue-400/20 shadow-lg shadow-blue-400/10"
                : "bg-card backdrop-blur-sm"
            }
          `}
        >
          {/* Teal-cyan gradient hero */}
          <div className="relative">
            <div
              className="h-28 w-full   
                opacity-90 group-hover:opacity-100 transition-opacity duration-300"
            >
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
              <div className="absolute bottom-0 left-0 right-0 h-16   " />
            </div>

            <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
              <Badge className="bg-blue-400/90 hover:bg-blue-400/10 text-white shadow-lg gap-1 text-xs">
                <FlaskConical className="h-3 w-3" />
                Research
              </Badge>
              {isFree && (
                <Badge className="bg-blue-400/90 hover:bg-blue-400/10 text-white shadow-lg gap-1 text-xs">
                  <DollarSign className="h-3 w-3" />
                  Free
                </Badge>
              )}
            </div>
          </div>

          <div className="relative px-5 pb-5 -mt-10 z-20">
            <div className="flex justify-between items-end mb-4">
              <div className="rounded-xl border-4 border-card shadow-lg bg-card">
                <Avatar className="h-16 w-16 rounded-lg">
                  <AvatarImage
                    src={opportunity.logo || getCompanyLogoUrl(opportunity.institution || opportunity.company) || undefined}
                    alt={opportunity.institution || opportunity.company}
                    className="object-cover [image-rendering:crisp-edges]"
                  />
                  <AvatarFallback className="rounded-lg text-lg font-bold    text-blue-400 dark:text-blue-400">
                    {(opportunity.institution || opportunity.company || "R")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Relevance Score Ring */}
              {score > 0 && (
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <svg className="h-12 w-12 -rotate-90">
                      <circle
                        className="text-muted/30"
                        strokeWidth="3"
                        stroke="currentColor"
                        fill="transparent"
                        r="20"
                        cx="24"
                        cy="24"
                      />
                      <motion.circle
                        className="text-blue-400"
                        strokeWidth="3"
                        strokeDasharray={126}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="20"
                        cx="24"
                        cy="24"
                        initial={{ strokeDashoffset: 126 }}
                        animate={{ strokeDashoffset: 126 - (126 * score) / 100 }}
                        transition={{ duration: 0.8, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-blue-400">{score}%</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground mt-0.5">match</span>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <div>
                <h3 className="font-semibold text-base leading-snug text-foreground group-hover:text-blue-400 dark:group-hover:text-blue-400 transition-colors duration-200 line-clamp-2">
                  {opportunity.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <span className="truncate">{opportunity.institution || opportunity.company}</span>
                  {opportunity.remote && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4 bg-blue-400/10 text-blue-400 dark:text-blue-400 border-0"
                    >
                      <Globe className="h-2.5 w-2.5 mr-0.5" />
                      Remote
                    </Badge>
                  )}
                </p>
              </div>

              {/* AI Match Explanation */}
              {opportunity.matchExplanation && (
                <div className="flex items-start gap-1.5 text-xs text-blue-400 dark:text-teal-300/80 bg-blue-400/5 border border-blue-400/10 rounded-lg px-2.5 py-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
                  <span className="italic line-clamp-2 leading-relaxed">
                    {opportunity.matchExplanation}
                  </span>
                </div>
              )}

              {/* Research Areas */}
              {opportunity.researchAreas && opportunity.researchAreas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {opportunity.researchAreas.slice(0, 3).map((area) => (
                    <Badge
                      key={area}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 bg-blue-400/5 border-blue-400/20 font-normal text-blue-400 dark:text-teal-300"
                    >
                      {area}
                    </Badge>
                  ))}
                  {opportunity.researchAreas.length > 3 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 bg-muted/20 border-border/40 font-normal text-muted-foreground"
                    >
                      +{opportunity.researchAreas.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                  {opportunity.locationType ||
                    (opportunity.remote ? "Remote" : opportunity.location) ||
                    "Not specified"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 shrink-0 opacity-70" />
                  {hasDeadline ? opportunity.deadline : "Rolling"}
                </span>
                {opportunity.gradeLevels && opportunity.gradeLevels.length > 0 && (
                  <span className="flex items-center gap-1.5 truncate">
                    <GraduationCap className="h-3 w-3 shrink-0 opacity-70" />
                    {formatGradeLevels(opportunity.gradeLevels)}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-medium shadow-sm gap-1.5    hover: hover: text-white"
                onClick={(e) => {
                  e.stopPropagation()
                  onGenerateEmail?.(e, opportunity)
                }}
              >
                <Mail className="h-3.5 w-3.5" />
                Generate Email
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`h-9 w-9 shrink-0 transition-colors duration-200 ${
                  opportunity.saved
                    ? "border-blue-400/50 text-blue-400 bg-blue-400/5 hover:bg-blue-400/10"
                    : "hover:bg-muted hover:border-muted-foreground/20"
                }`}
                onClick={(e) => onToggleSave(e, opportunity.id)}
                disabled={saving}
              >
                {opportunity.saved ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
