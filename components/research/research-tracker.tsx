"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Star,
  Mail,
  MessageSquare,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Calendar,
  MapPin,
  Loader2,
  Inbox,
} from "lucide-react"
import type { Opportunity } from "@/types/opportunity"
import {
  RESEARCH_STATUS_CONFIG,
  RESEARCH_STATUS_ORDER,
  type ResearchTrackingStatus,
} from "@/types/research"
import { updateResearchStatus } from "@/app/actions/research"
import { getCompanyLogoUrl } from "@/lib/company-logo"

const STATUS_ICONS: Record<ResearchTrackingStatus, typeof Star> = {
  interested: Star,
  emailed: Mail,
  response_received: MessageSquare,
  accepted: CheckCircle2,
  rejected: XCircle,
}

interface TrackedLab extends Opportunity {
  researchStatus: ResearchTrackingStatus
  trackedAt: string
}

interface ResearchTrackerProps {
  labs: TrackedLab[]
  onStatusChange?: (labId: string, newStatus: ResearchTrackingStatus) => void
  onLabClick?: (lab: TrackedLab) => void
}

export function ResearchTracker({ labs, onStatusChange, onLabClick }: ResearchTrackerProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleStatusChange = async (labId: string, newStatus: ResearchTrackingStatus) => {
    setUpdatingId(labId)
    try {
      await updateResearchStatus(labId, newStatus)
      onStatusChange?.(labId, newStatus)
    } catch (error) {
      console.error("Failed to update status:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  // Group labs by status
  const grouped = RESEARCH_STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = labs.filter((l) => l.researchStatus === status)
      return acc
    },
    {} as Record<ResearchTrackingStatus, TrackedLab[]>
  )

  const totalLabs = labs.length

  if (totalLabs === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 px-4 text-center"
      >
        <div className="h-20 w-20 rounded-2xl bg-teal-500/10 flex items-center justify-center mb-6">
          <Inbox className="h-10 w-10 text-teal-500/60" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Labs Tracked Yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Start exploring research programs in the Discover tab and save the ones that interest you. They&apos;ll appear here so you can track your outreach pipeline.
        </p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-3">
        {RESEARCH_STATUS_ORDER.map((status) => {
          const config = RESEARCH_STATUS_CONFIG[status]
          const count = grouped[status].length
          const Icon = STATUS_ICONS[status]

          return (
            <div
              key={status}
              className={`rounded-xl border p-3 text-center ${config.bgColor} transition-colors`}
            >
              <Icon className={`h-4 w-4 mx-auto mb-1 ${config.color}`} />
              <div className={`text-xl font-bold ${config.color}`}>{count}</div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {config.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pipeline Columns - Desktop */}
      <div className="hidden lg:grid lg:grid-cols-5 gap-4">
        {RESEARCH_STATUS_ORDER.map((status) => {
          const config = RESEARCH_STATUS_CONFIG[status]
          const statusLabs = grouped[status]
          const Icon = STATUS_ICONS[status]

          return (
            <div key={status} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Icon className={`h-4 w-4 ${config.color}`} />
                <span className="text-sm font-semibold">{config.label}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 h-5 ml-auto">
                  {statusLabs.length}
                </Badge>
              </div>

              <div className="space-y-2 min-h-[100px]">
                <AnimatePresence mode="popLayout">
                  {statusLabs.map((lab) => (
                    <TrackerCard
                      key={lab.id}
                      lab={lab}
                      updating={updatingId === lab.id}
                      onStatusChange={handleStatusChange}
                      onClick={() => onLabClick?.(lab)}
                    />
                  ))}
                </AnimatePresence>

                {statusLabs.length === 0 && (
                  <div className="border border-dashed border-border/40 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">No labs</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: Stacked Cards */}
      <div className="lg:hidden space-y-3">
        {labs.map((lab) => (
          <TrackerCard
            key={lab.id}
            lab={lab}
            updating={updatingId === lab.id}
            onStatusChange={handleStatusChange}
            onClick={() => onLabClick?.(lab)}
            showStatusSelect
          />
        ))}
      </div>
    </div>
  )
}

function TrackerCard({
  lab,
  updating,
  onStatusChange,
  onClick,
  showStatusSelect = false,
}: {
  lab: TrackedLab
  updating: boolean
  onStatusChange: (id: string, status: ResearchTrackingStatus) => void
  onClick?: () => void
  showStatusSelect?: boolean
}) {
  const config = RESEARCH_STATUS_CONFIG[lab.researchStatus]
  const Icon = STATUS_ICONS[lab.researchStatus]
  const logoUrl = lab.logo || getCompanyLogoUrl(lab.institution || lab.company) || undefined

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card
        className="p-3 border-border/50 bg-card/50 backdrop-blur-sm hover:border-teal-500/20 hover:shadow-sm transition-all cursor-pointer"
        onClick={onClick}
      >
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 rounded-lg shrink-0">
            <AvatarImage src={logoUrl} className="object-cover" />
            <AvatarFallback className="rounded-lg text-xs font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">
              {(lab.institution || lab.company || "R")[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate">{lab.title}</h4>
            <p className="text-xs text-muted-foreground truncate">
              {lab.institution || lab.company}
            </p>

            {/* Mobile status select */}
            {showStatusSelect && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={lab.researchStatus}
                  onValueChange={(v) => onStatusChange(lab.id, v as ResearchTrackingStatus)}
                  disabled={updating}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESEARCH_STATUS_ORDER.map((status) => (
                      <SelectItem key={status} value={status} className="text-xs">
                        {RESEARCH_STATUS_CONFIG[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Desktop: Status badge */}
          {!showStatusSelect && (
            <div onClick={(e) => e.stopPropagation()}>
              <Select
                value={lab.researchStatus}
                onValueChange={(v) => onStatusChange(lab.id, v as ResearchTrackingStatus)}
                disabled={updating}
              >
                <SelectTrigger
                  className={`h-7 text-[10px] px-2 border ${config.bgColor} ${config.color} font-medium min-w-0 w-auto`}
                >
                  {updating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {RESEARCH_STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status} className="text-xs">
                      {RESEARCH_STATUS_CONFIG[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  )
}
