// ─── Research Page Types ─────────────────────────────────────────────────────

export type ResearchTrackingStatus =
  | "interested"
  | "emailed"
  | "response_received"
  | "accepted"
  | "rejected"

export const RESEARCH_STATUS_CONFIG: Record<
  ResearchTrackingStatus,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  interested: {
    label: "Interested",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: "Star",
  },
  emailed: {
    label: "Emailed",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    icon: "Mail",
  },
  response_received: {
    label: "Response Received",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    icon: "MessageSquare",
  },
  accepted: {
    label: "Accepted",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    icon: "CheckCircle2",
  },
  rejected: {
    label: "Rejected",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    icon: "XCircle",
  },
}

export const RESEARCH_STATUS_ORDER: ResearchTrackingStatus[] = [
  "interested",
  "emailed",
  "response_received",
  "accepted",
  "rejected",
]

export interface ResearchEmailVariation {
  tone: "formal" | "conversational" | "concise"
  subject: string
  body: string
}

export const RESEARCH_FOCUS_AREAS = [
  "Biology",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Mathematics",
  "Engineering",
  "Neuroscience",
  "Environmental Science",
  "Medicine",
  "Psychology",
  "Data Science",
  "Economics",
  "Political Science",
  "Astronomy",
] as const

export type ResearchFocusArea = (typeof RESEARCH_FOCUS_AREAS)[number]

export interface ResearchSearchResult {
  opportunity: any // mapped opportunity
  relevanceScore: number
  matchExplanation: string
}
