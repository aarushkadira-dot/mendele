"use server"

import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { googleAI } from "@/lib/ai"
import type { Opportunity } from "@/lib/types"
import type { ResearchTrackingStatus, ResearchSearchResult } from "@/types/research"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "1 day ago"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return `${Math.floor(diffDays / 30)} months ago`
}

function mapOpp(opp: Opportunity, userOpp?: { match_score: number; match_reasons: unknown; status: string } | null) {
  return {
    id: opp.id,
    url: opp.url,
    title: opp.title,
    company: opp.company,
    location: opp.location,
    type: opp.type,
    category: opp.category,
    suggestedCategory: opp.suggested_category,
    gradeLevels: opp.grade_levels,
    locationType: opp.location_type,
    startDate: opp.start_date,
    endDate: opp.end_date,
    cost: opp.cost,
    timeCommitment: opp.time_commitment,
    prizes: opp.prizes,
    contactEmail: opp.contact_email,
    applicationUrl: opp.application_url,
    matchScore: userOpp?.match_score || 0,
    matchReasons: (Array.isArray(userOpp?.match_reasons) ? userOpp.match_reasons : []) as string[],
    deadline: opp.deadline ? formatDate(new Date(opp.deadline)) : null,
    postedDate: getRelativeTime(new Date(opp.posted_date || opp.created_at)),
    logo: opp.logo,
    skills: opp.skills || [],
    description: opp.description,
    salary: opp.salary,
    duration: opp.duration,
    remote: opp.remote,
    applicants: opp.applicants || 0,
    requirements: opp.requirements,
    sourceUrl: opp.source_url,
    timingType: opp.timing_type,
    extractionConfidence: opp.extraction_confidence,
    isActive: opp.is_active,
    isExpired: opp.is_expired,
    lastVerified: opp.last_verified,
    recheckAt: opp.recheck_at,
    nextCycleExpected: opp.next_cycle_expected,
    dateDiscovered: opp.date_discovered,
    createdAt: opp.created_at,
    updatedAt: opp.updated_at,
    status: userOpp?.status || null,
    saved: userOpp?.status === "saved" || userOpp?.status === "applied",
    // Research-specific
    matchExplanation: null as string | null,
    researchAreas: (opp.skills || []) as string[],
    institution: opp.company,
  }
}

// ─── HS Relevance Filter (Research-specific) ─────────────────────────────────

const RESEARCH_ADULT_PATTERNS = [
  // Postdoc
  /\bpostdoc(?:toral)?\b/i,
  // PhD
  /\bphd\s+(position|internship|fellowship|candidate|program|student|degree)\b/i,
  /\bcurrent\s+phd\b/i,
  // Doctoral
  /\bdoctoral\s+(position|internship|fellowship|program|student|degree|candidate)\b/i,
  // Graduate
  /\bgraduate\s+(internship|program|student|degree|researcher|fellow|position|fellowship)\b/i,
  /\bgrad\s+(student|program|researcher|fellow)\b/i,
  // Master's
  /\bmaster'?s?\s+(degree|program|student|thesis|candidate)\b/i,
  /\bmsc\b/i,
  /\bm\.s\.\b/i,
  // Undergraduate (as a position level, not HS programs)
  /\bundergraduate\s+(research(?:er)?|internship|program|position|fellow|student)\b/i,
  // Faculty / professor recruitment
  /\b(faculty|professor)\s+(position|opening|recruitment|hiring|search)\b/i,
  // Senior professional roles
  /\bsenior\s+(software\s+)?(engineer|developer|manager|scientist|researcher)\b/i,
]

function isHsRelevantResearch(opp: { grade_levels?: number[] | null; title?: string | null }): boolean {
  // Grade level check — keep if no restriction or includes HS grades
  const grades = opp.grade_levels
  if (grades && grades.length > 0) {
    const hsGrades = new Set([9, 10, 11, 12])
    if (!grades.some((g) => hsGrades.has(g))) return false
  }
  // Title pattern check
  const title = opp.title || ""
  return !RESEARCH_ADULT_PATTERNS.some((p) => p.test(title))
}

function filterHsRelevantResearch<T extends { grade_levels?: number[] | null; title?: string | null }>(
  opps: T[]
): T[] {
  return opps.filter((opp) => isHsRelevantResearch(opp))
}

// ─── Get Research Opportunities ──────────────────────────────────────────────

export async function getResearchOpportunities(filters?: {
  focusArea?: string
  locationType?: string
  gradeLevel?: number
  page?: number
  pageSize?: number
}) {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  const page = filters?.page || 1
  const pageSize = filters?.pageSize || 50
  const offset = (page - 1) * pageSize

  let query = supabase
    .from("opportunities")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .ilike("type", "research")
    .neq("title", "Unknown")
    .neq("title", "")

  if (filters?.locationType) {
    if (filters.locationType === "Online") {
      query = query.or("location_type.ilike.%online%,location_type.ilike.%virtual%,location_type.ilike.%remote%,remote.eq.true")
    } else if (filters.locationType === "In-Person") {
      query = query.or("location_type.ilike.%in-person%,location_type.ilike.%in person%,location_type.ilike.%onsite%")
    } else if (filters.locationType === "Hybrid") {
      query = query.ilike("location_type", "%hybrid%")
    }
  }

  if (filters?.focusArea) {
    const pattern = `%${filters.focusArea}%`
    query = query.or(`category.ilike.${pattern},title.ilike.${pattern},description.ilike.${pattern}`)
  }

  const { data, error, count } = await query
    .order("deadline", { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (error) throw new Error(error.message)

  const opportunities = (data as Opportunity[]) || []

  // Fetch user statuses
  let userOpportunities: Record<string, { match_score: number; match_reasons: unknown; status: string }> = {}
  if (authUser) {
    const { data: userOppsData } = await supabase
      .from("user_opportunities")
      .select("opportunity_id, match_score, match_reasons, status")
      .eq("user_id", authUser.id)

    for (const uo of (userOppsData || []) as any[]) {
      userOpportunities[uo.opportunity_id] = {
        match_score: uo.match_score,
        match_reasons: uo.match_reasons,
        status: uo.status,
      }
    }
  }

  // Grade filter (post-filter since Supabase array containment is limited)
  let filtered = opportunities
  if (filters?.gradeLevel) {
    const grade = filters.gradeLevel
    filtered = filtered.filter((opp) => {
      const levels = opp.grade_levels
      if (!levels || levels.length === 0) return true
      return levels.includes(grade)
    })
  }

  // Deduplicate
  const seen = new Set<string>()
  const deduped = filtered.filter((opp) => {
    const key = (opp.title || "").trim().toLowerCase()
    if (!key) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Filter out non-HS content (PhD, graduate, postdoc, master's, undergrad research positions)
  const hsFiltered = filterHsRelevantResearch(deduped)

  const mapped = hsFiltered.map((opp) => mapOpp(opp, userOpportunities[opp.id] || null))

  return {
    opportunities: mapped,
    totalCount: count || 0,
    page,
    pageSize,
    hasMore: offset + pageSize < (count || 0),
  }
}

// ─── Semantic Search ─────────────────────────────────────────────────────────

export async function semanticSearchResearch(query: string): Promise<{
  results: Array<{
    opportunity: ReturnType<typeof mapOpp>
    relevanceScore: number
    matchExplanation: string
  }>
}> {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  if (!query.trim()) return { results: [] }

  // Step 1: AI extracts structured intent from natural language query
  let extractedTerms: { subject_domains: string[]; skills: string[]; implied_interests: string[]; preferred_format: string | null }

  try {
    const extractionResult = await googleAI.complete({
      messages: [{
        role: "user",
        content: `Extract research interests from this query: "${query}"`,
      }],
      system: `You extract structured research interests from natural language queries. Return ONLY valid JSON, no markdown.
Format: { "subject_domains": ["string"], "skills": ["string"], "implied_interests": ["string"], "preferred_format": "string or null" }
Example input: "I love neuroscience and coding"
Example output: {"subject_domains":["neuroscience","computational neuroscience","brain science"],"skills":["programming","coding","data analysis"],"implied_interests":["brain-computer interfaces","neural modeling","cognitive science"],"preferred_format":null}`,
      temperature: 0.3,
      maxTokens: 500,
    })

    const rawContent = Array.isArray(extractionResult.content)
      ? extractionResult.content.map((p: any) => (typeof p === "string" ? p : p.text ?? "")).join("")
      : String(extractionResult.content)
    const jsonStr = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    extractedTerms = JSON.parse(jsonStr)
  } catch {
    // Fallback: use raw query words
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    extractedTerms = {
      subject_domains: words,
      skills: [],
      implied_interests: [],
      preferred_format: null,
    }
  }

  // Step 2: Build search terms from extracted intent
  const allTerms = [
    ...extractedTerms.subject_domains,
    ...extractedTerms.skills,
    ...extractedTerms.implied_interests,
  ].filter(Boolean)

  // Build OR conditions for ilike search
  const uniqueTerms = [...new Set(allTerms.map((t) => t.toLowerCase()))].slice(0, 12)
  const orConditions = uniqueTerms
    .flatMap((term) => [
      `title.ilike.%${term}%`,
      `description.ilike.%${term}%`,
      `category.ilike.%${term}%`,
    ])
    .join(",")

  if (!orConditions) return { results: [] }

  let dbQuery = supabase
    .from("opportunities")
    .select("*")
    .eq("is_active", true)
    .ilike("type", "research")
    .neq("title", "Unknown")
    .neq("title", "")
    .or(orConditions)
    .limit(100)

  const { data } = await dbQuery.order("deadline", { ascending: true })
  const opportunities = (data as Opportunity[]) || []

  // Step 3: Score results by keyword density
  const seen = new Set<string>()
  const scored = opportunities
    .filter((opp) => {
      const key = (opp.title || "").trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter((opp) => isHsRelevantResearch(opp))
    .map((opp) => {
      const text = `${opp.title} ${opp.description} ${opp.category} ${(opp.skills || []).join(" ")}`.toLowerCase()
      let score = 0
      for (const term of uniqueTerms) {
        if (text.includes(term.toLowerCase())) score += 10
        if ((opp.title || "").toLowerCase().includes(term.toLowerCase())) score += 15 // title boost
      }
      return { opp, score }
    })
    .filter(({ score }) => score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  if (scored.length === 0) return { results: [] }

  // Fetch user statuses
  let userOpportunities: Record<string, { match_score: number; match_reasons: unknown; status: string }> = {}
  if (authUser) {
    const { data: userOppsData } = await supabase
      .from("user_opportunities")
      .select("opportunity_id, match_score, match_reasons, status")
      .eq("user_id", authUser.id)
    for (const uo of (userOppsData || []) as any[]) {
      userOpportunities[uo.opportunity_id] = {
        match_score: uo.match_score,
        match_reasons: uo.match_reasons,
        status: uo.status,
      }
    }
  }

  // Step 4: Batch AI call to generate match explanations
  const summaries = scored.map(({ opp }) => ({
    title: opp.title,
    institution: opp.company,
    description: (opp.description || "").slice(0, 200),
    skills: (opp.skills || []).join(", "),
  }))

  let explanations: string[] = []
  try {
    const explainResult = await googleAI.complete({
      messages: [{
        role: "user",
        content: `Student's research interests: "${query}"
Extracted intent: ${JSON.stringify(extractedTerms)}

Research programs found (generate a 1-2 sentence match explanation for each):
${summaries.map((s, i) => `${i + 1}. ${s.title} at ${s.institution}: ${s.description}`).join("\n")}

Return ONLY a JSON array of strings, one explanation per program. Each should explain WHY this matches the student's interests. Be specific. Example: ["This lab studies infectious disease spread using Python simulations, aligning with your interest in epidemiology and coding.", ...]`,
      }],
      system: "You generate concise, specific match explanations for research programs. Return ONLY a JSON array of strings. No markdown formatting.",
      temperature: 0.5,
      maxTokens: 2000,
    })

    const rawExplainContent = Array.isArray(explainResult.content)
      ? explainResult.content.map((p: any) => (typeof p === "string" ? p : p.text ?? "")).join("")
      : String(explainResult.content)
    const jsonStr = rawExplainContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    explanations = JSON.parse(jsonStr)
  } catch {
    explanations = scored.map(({ opp }) =>
      `Matches your research interests based on ${opp.category || opp.type} focus.`
    )
  }

  // Step 5: Build results with mapped opportunities and explanations
  const results = scored.map(({ opp, score }, i) => ({
    opportunity: {
      ...mapOpp(opp, userOpportunities[opp.id] || null),
      matchExplanation: explanations[i] || `Matches your research interests.`,
    },
    relevanceScore: Math.min(100, Math.round((score / (uniqueTerms.length * 25)) * 100)),
    matchExplanation: explanations[i] || `Matches your research interests.`,
  }))

  return { results }
}

// ─── Research Tracking ───────────────────────────────────────────────────────

/** Map our research-specific statuses to user_opportunities-compatible values */
function mapStatusToDb(status: ResearchTrackingStatus): { dbStatus: string; researchMeta: Record<string, string> } {
  switch (status) {
    case "interested":
      return { dbStatus: "saved", researchMeta: { research_status: "interested" } }
    case "emailed":
      return { dbStatus: "applied", researchMeta: { research_status: "emailed" } }
    case "response_received":
      return { dbStatus: "applied", researchMeta: { research_status: "response_received" } }
    case "accepted":
      return { dbStatus: "applied", researchMeta: { research_status: "accepted" } }
    case "rejected":
      return { dbStatus: "dismissed", researchMeta: { research_status: "rejected" } }
  }
}

export async function updateResearchStatus(opportunityId: string, status: ResearchTrackingStatus) {
  const authUser = await getCurrentUser()
  if (!authUser) throw new Error("Not authenticated")
  const supabase = await createClient()

  const { dbStatus, researchMeta } = mapStatusToDb(status)

  const { error } = await supabase.from("user_opportunities").upsert(
    {
      user_id: authUser.id,
      opportunity_id: opportunityId,
      status: dbStatus,
      match_score: 0,
      match_reasons: researchMeta,
    } as any,
    { onConflict: "user_id,opportunity_id" }
  )

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function saveResearchLab(opportunityId: string) {
  return updateResearchStatus(opportunityId, "interested")
}

export async function unsaveResearchLab(opportunityId: string) {
  const authUser = await getCurrentUser()
  if (!authUser) throw new Error("Not authenticated")
  const supabase = await createClient()

  const { error } = await supabase
    .from("user_opportunities")
    .delete()
    .eq("user_id", authUser.id)
    .eq("opportunity_id", opportunityId)

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function getTrackedLabs() {
  const authUser = await getCurrentUser()
  if (!authUser) return { labs: [] }
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("user_opportunities")
    .select("*, opportunity:opportunities(*)")
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  // Filter to only research type opportunities
  const researchLabs = ((data || []) as any[]).filter(
    (row) => row.opportunity?.type === "research"
  )

  return {
    labs: researchLabs.map((row) => {
      // Determine research-specific status from match_reasons
      const meta = row.match_reasons as Record<string, string> | null
      let researchStatus: ResearchTrackingStatus = "interested"

      if (meta && typeof meta === "object" && "research_status" in meta) {
        researchStatus = meta.research_status as ResearchTrackingStatus
      } else if (row.status === "applied") {
        researchStatus = "emailed"
      } else if (row.status === "dismissed") {
        researchStatus = "rejected"
      }

      return {
        ...mapOpp(row.opportunity, row),
        researchStatus,
        trackedAt: row.created_at,
      }
    }),
  }
}
