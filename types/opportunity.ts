export interface Opportunity {
  id: string
  title: string
  company: string
  location: string
  type: string
  matchScore: number
  matchReasons?: string[]
  deadline: string | null
  postedDate: string
  logo: string | null
  skills: string[]
  description: string | null
  salary: string | null
  duration: string | null
  remote: boolean
  applicants: number
  saved: boolean
  
  category?: string
  suggestedCategory?: string | null
  gradeLevels?: number[]
  locationType?: string
  startDate?: string | null
  endDate?: string | null
  cost?: string | null
  timeCommitment?: string | null
  prizes?: string | null
  contactEmail?: string | null
  applicationUrl?: string | null
  
  requirements?: string | null
  sourceUrl?: string | null
  url?: string | null
  timingType?: string
  extractionConfidence?: number
  isActive?: boolean
  isExpired?: boolean
  lastVerified?: string | null
  recheckAt?: string | null
  nextCycleExpected?: string | null
  dateDiscovered?: string | null
  createdAt?: string
  updatedAt?: string
  // Research-specific fields
  institution?: string
  researchAreas?: string[]
  matchExplanation?: string | null
  status?: string | null
}

export const OPPORTUNITY_TYPES = [
  { value: "internship", label: "Internship", color: "from-blue-600 to-indigo-600" },
  { value: "research", label: "Research", color: "from-teal-500 to-cyan-600" },
  { value: "competition", label: "Competition", color: "from-rose-500 to-pink-600" },
  { value: "fellowship", label: "Fellowship", color: "from-violet-600 to-purple-600" },
  { value: "program", label: "Program", color: "from-emerald-500 to-green-600" },
  { value: "scholarship", label: "Scholarship", color: "from-amber-500 to-orange-600" },
  { value: "volunteer", label: "Volunteer", color: "from-sky-500 to-blue-600" },
] as const

export const GRADE_LEVEL_MAP: Record<number, string> = {
  9: "9th Grade",
  10: "10th Grade", 
  11: "11th Grade",
  12: "12th Grade",
}

export const getTypeGradient = (type?: string | null): string => {
  if (!type) return "from-slate-600 to-gray-600"
  const normalizedType = type.toLowerCase()
  const found = OPPORTUNITY_TYPES.find(t => normalizedType.includes(t.value))
  return found?.color || "from-slate-600 to-gray-600"
}

// CSS gradient strings — used instead of Tailwind classes to avoid purging in production
// (Tailwind v4 cannot statically detect classes injected via template literal interpolation)
const TYPE_GRADIENT_CSS: Record<string, string> = {
  internship:  "linear-gradient(to bottom right, #2563eb, #4338ca)",
  research:    "linear-gradient(to bottom right, #14b8a6, #0891b2)",
  competition: "linear-gradient(to bottom right, #f43f5e, #ec4899)",
  fellowship:  "linear-gradient(to bottom right, #7c3aed, #9333ea)",
  program:     "linear-gradient(to bottom right, #10b981, #16a34a)",
  scholarship: "linear-gradient(to bottom right, #f59e0b, #ea580c)",
  volunteer:   "linear-gradient(to bottom right, #0ea5e9, #2563eb)",
}
const DEFAULT_GRADIENT_CSS = "linear-gradient(to bottom right, #475569, #4b5563)"

export const getTypeGradientStyle = (type?: string | null): string => {
  if (!type) return DEFAULT_GRADIENT_CSS
  const normalizedType = type.toLowerCase()
  const found = OPPORTUNITY_TYPES.find(t => normalizedType.includes(t.value))
  return found ? (TYPE_GRADIENT_CSS[found.value] ?? DEFAULT_GRADIENT_CSS) : DEFAULT_GRADIENT_CSS
}

export const getMatchScoreColor = (score: number): string => {
  if (score >= 90) return "text-emerald-500"
  if (score >= 75) return "text-blue-500"
  if (score >= 60) return "text-amber-500"
  return "text-slate-400"
}

export const getMatchScoreBgColor = (score: number): string => {
  if (score >= 90) return "bg-emerald-500/10 border-emerald-500/30"
  if (score >= 75) return "bg-blue-500/10 border-blue-500/30"
  if (score >= 60) return "bg-amber-500/10 border-amber-500/30"
  return "bg-slate-500/10 border-slate-500/30"
}

export const formatGradeLevels = (levels?: number[]): string => {
  if (!levels || levels.length === 0) return "All Grades"
  if (levels.length === 4) return "All High School"
  return levels.map(l => GRADE_LEVEL_MAP[l] || `Grade ${l}`).join(", ")
}
