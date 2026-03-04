"use client"

import { motion } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Globe, Presentation, Linkedin, Users } from "lucide-react"
import type { Project } from "@/lib/projects"

// ─── Grade badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const config = {
    A: { bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", label: "Investor Ready" },
    B: { bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20", label: "Fundable" },
    C: { bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "Early Stage" },
    D: { bg: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20", label: "Idea Phase" },
  }[grade] ?? { bg: "bg-muted/50 text-muted-foreground border-transparent", label: grade }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.bg}`}>
      {grade !== "N/A" && <span className="mr-1 font-black">{grade}</span>}
      {config.label}
    </span>
  )
}

// ─── Link icons ───────────────────────────────────────────────────────────────

function LinkIcons({ links }: { links: { type: string; url: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      {links.some((l) => l.type === "website") && (
        <a
          href={links.find((l) => l.type === "website")?.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Website"
        >
          <Globe className="h-3.5 w-3.5" />
        </a>
      )}
      {links.some((l) => l.type === "pitch") && (
        <a
          href={links.find((l) => l.type === "pitch")?.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Pitch Deck"
        >
          <Presentation className="h-3.5 w-3.5" />
        </a>
      )}
      {links.some((l) => l.type === "linkedin") && (
        <a
          href={links.find((l) => l.type === "linkedin")?.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="LinkedIn"
        >
          <Linkedin className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

// ─── Main Card ────────────────────────────────────────────────────────────────

interface StartupCardProps {
  project: Project & { lastUpdateDate?: string | null }
  index?: number
  grade?: string
}

export function StartupCard({ project, index = 0, grade }: StartupCardProps) {
  const teamSize = (project.collaborators?.length ?? 0) + 1

  const statusLabel = {
    planning: "Idea",
    active: "Active",
    "in progress": "Active",
    in_progress: "Active",
    completed: "Shipped",
    prototype: "Prototype",
    paused: "Paused",
  }[project.status?.toLowerCase() ?? ""] ?? project.status

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="rounded-xl border border-border/50 bg-card p-4 space-y-3 hover:shadow-md hover:border-border/80 transition-all cursor-default group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {project.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {statusLabel}
            </Badge>
            {grade && <GradeBadge grade={grade} />}
          </div>
        </div>
        <LinkIcons links={project.links || []} />
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {project.description}
      </p>

      {/* Tags */}
      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {tag}
            </Badge>
          ))}
          {project.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{project.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {project.progress > 0 && (
        <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/60"
            style={{ width: `${Math.min(100, project.progress)}%` }}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5">
            {project.ownerAvatar && <AvatarImage src={project.ownerAvatar} alt={project.ownerName} />}
            <AvatarFallback className="text-[9px]">
              {(project.ownerName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
            {project.ownerName || "Founder"}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{teamSize}</span>
        </div>
      </div>
    </motion.div>
  )
}
