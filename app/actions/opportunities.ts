"use server"

import { revalidatePath } from "next/cache"

import { createClient, requireAuth, getCurrentUser } from "@/lib/supabase/server"
import { triggerDiscovery } from "@/app/actions/discovery"
import type { Opportunity, UserOpportunity, User } from "@/lib/types"
import { parseSearchQuery, scoreDomainMatch, textMatchesType, getTypeSearchTerms, fuzzyCorrectQuery } from "@/lib/search/query-parser"
import { getPersonalizedOpportunitiesStar } from "@/lib/matching/star-orchestrator"

// Discovery cooldown tracking (in-memory, resets on server restart)
const discoveryLocks = new Map<string, number>()
const DISCOVERY_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes - aggressive cooldown for cost/speed optimization

// ─── High School Relevance Filter ────────────────────────────────────────────
// Applied to ALL opportunity queries to ensure only HS-relevant content is shown.
//
// Strategy: exclude only when grade_levels is explicitly set to non-HS grades
// (e.g., [6,7,8] or [4,5,6,7,8]). Empty grade_levels = assume HS-relevant.
// College/adult-only content is filtered at DB level by filter_hs_only.py script.
//
// The Supabase `cs` (contains) operator on arrays lets us check if grade_levels
// contains ANY of the HS grades (9, 10, 11, 12). We use the NOT-contains approach:
// only exclude rows where grade_levels is non-empty AND contains NO HS grades.
// Since Supabase doesn't support NOT-contains directly in a single filter, we
// post-filter in JS after fetching — already fast because we limit rows.

/**
 * Post-filter to exclude opportunities that have explicit non-HS grade levels.
 * Keeps everything with empty grade_levels (assume open/HS-appropriate).
 * Removes only rows where grade_levels has values but NONE are 9-12.
 */
function isHsRelevant(opp: { grade_levels?: number[] | null }): boolean {
  const grades = opp.grade_levels
  if (!grades || grades.length === 0) return true // no restriction = keep
  const hsGrades = new Set([9, 10, 11, 12])
  return grades.some(g => hsGrades.has(g))
}

// College/adult-only text patterns — post-filter for content already in DB
const ADULT_ONLY_TITLE_PATTERNS = [
  /\bpostdoc(?:toral)?\b/i,
  /\bphd\s+(position|internship|fellowship|candidate)\b/i,
  /\bdoctoral\s+(position|internship|fellowship)\b/i,
  /\bgraduate\s+internship\b/i,
  /\bundergraduate\s+internship\b/i,
  /\bcurrent\s+phd\b/i,
  /\bsenior\s+(software\s+)?(engineer|developer|manager|scientist|researcher)\b/i,
]

function isTitleHsAppropriate(title: string): boolean {
  const t = title.toLowerCase()
  return !ADULT_ONLY_TITLE_PATTERNS.some(p => p.test(t))
}

/**
 * Combined HS relevance check — apply to ALL opportunities before returning.
 */
function filterHsRelevant<T extends { grade_levels?: number[] | null; title?: string }>(opps: T[]): T[] {
  return opps.filter(opp => isHsRelevant(opp) && isTitleHsAppropriate(opp.title || ""))
}

/**
 * Apply location type filter to a Supabase query object.
 * Handles variations in how location_type is stored in the DB.
 */
function applyLocationTypeFilter(q: any, locationType: string | undefined): any {
  if (!locationType) return q
  if (locationType === "Online") {
    return q.or("location_type.ilike.%online%,location_type.ilike.%virtual%,location_type.ilike.%remote%,remote.eq.true")
  }
  if (locationType === "In-Person") {
    return q.or("location_type.ilike.%in-person%,location_type.ilike.%in person%,location_type.ilike.%onsite%,location_type.ilike.%in%person%")
  }
  if (locationType === "Hybrid") {
    return q.ilike("location_type", "%hybrid%")
  }
  return q
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

function canTriggerDiscovery(query: string): boolean {
  const normalized = normalizeQuery(query)
  const lastTrigger = discoveryLocks.get(normalized)

  if (!lastTrigger) return true

  const timeSince = Date.now() - lastTrigger
  return timeSince > DISCOVERY_COOLDOWN_MS
}

function markDiscoveryTriggered(query: string): void {
  const normalized = normalizeQuery(query)
  discoveryLocks.set(normalized, Date.now())

  // Clean up old entries (older than 15 minutes)
  const cutoff = Date.now() - 15 * 60 * 1000
  for (const [key, timestamp] of discoveryLocks.entries()) {
    if (timestamp < cutoff) {
      discoveryLocks.delete(key)
    }
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "1 day ago"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return `${Math.floor(diffDays / 30)} months ago`
}

export async function getOpportunities(filters?: {
  type?: string
  category?: string
  remote?: boolean
  page?: number
  pageSize?: number
  /** Filter by location type: "Online", "In-Person", "Hybrid" */
  locationType?: string
  /** Filter by grade levels — only return opps that include these grades */
  gradeLevel?: number
  /** Filter by status: "current" (open/active), "past" (expired/closed) */
  status?: "current" | "past"
}) {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  const page = filters?.page || 1
  const pageSize = filters?.pageSize || 50
  const offset = (page - 1) * pageSize

  let query = supabase.from("opportunities").select("*", { count: "exact" }).eq("is_active", true)
    .neq("title", "Unknown")   // Filter out placeholder entries
    .neq("title", "")          // Filter out empty titles

  if (filters?.type) query = query.eq("type", filters.type)
  if (filters?.category) query = query.eq("category", filters.category)
  if (filters?.remote !== undefined) query = query.eq("remote", filters.remote)
  if (filters?.locationType) {
    if (filters.locationType === "Online") {
      // Match both "Online" and remote=true
      query = query.or(`location_type.ilike.%online%,location_type.ilike.%virtual%,location_type.ilike.%remote%,remote.eq.true`)
    } else if (filters.locationType === "In-Person") {
      query = query.or(`location_type.ilike.%in-person%,location_type.ilike.%in person%,location_type.ilike.%onsite%`)
    } else if (filters.locationType === "Hybrid") {
      query = query.ilike("location_type", "%hybrid%")
    }
  }

  // Status filter: current (not expired) vs past (expired)
  if (filters?.status === "current") {
    query = query.or(`is_expired.eq.false,is_expired.is.null`)
    query = query.or(`deadline.is.null,deadline.gte.${new Date().toISOString()}`)
  } else if (filters?.status === "past") {
    query = query.or(`is_expired.eq.true,deadline.lt.${new Date().toISOString()}`)
  }

  const { data, error, count } = await query
    .order("deadline", { ascending: true })
    .range(offset, offset + pageSize - 1)

  const opportunities = data as Opportunity[] | null

  if (error) throw new Error(error.message)

  let userOpportunities: Record<string, { match_score: number; match_reasons: unknown; status: string }> =
    {}

  if (authUser) {
    const { data: userOppsData } = await supabase
      .from("user_opportunities")
      .select("opportunity_id, match_score, match_reasons, status")
      .eq("user_id", authUser.id)

    const userOpps = userOppsData as UserOpportunity[] | null

    userOpportunities = (userOpps || []).reduce((acc: any, uo: UserOpportunity) => {
      acc[uo.opportunity_id] = {
        match_score: uo.match_score,
        match_reasons: uo.match_reasons,
        status: uo.status,
      }
      return acc
    }, {} as Record<string, { match_score: number; match_reasons: unknown; status: string }>)
  }

  // Filter to HS-relevant only, then deduplicate by title
  let hsFiltered = filterHsRelevant(opportunities || [])

  // Grade level filter — only include opps that have no grade restriction OR include the selected grade
  if (filters?.gradeLevel) {
    const grade = filters.gradeLevel
    hsFiltered = hsFiltered.filter((opp: Opportunity) => {
      const levels = opp.grade_levels
      if (!levels || levels.length === 0) return true // no restriction = open to all
      return levels.includes(grade)
    })
  }
  const seenTitles = new Set<string>()
  const deduped = hsFiltered.filter((opp: Opportunity) => {
    const key = (opp.title || "").trim().toLowerCase()
    if (!key) return false
    if (seenTitles.has(key)) return false
    seenTitles.add(key)
    return true
  })

  // Deprioritize unverified/stale opportunities — verified ones sort first
  deduped.sort((a: Opportunity, b: Opportunity) => {
    const aVerified = a.last_verified ? 1 : 0
    const bVerified = b.last_verified ? 1 : 0
    if (aVerified !== bVerified) return bVerified - aVerified
    return 0 // preserve existing order within each group
  })

  const mapped = deduped.map((opp: Opportunity) => {
    const userOpp = userOpportunities[opp.id]
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
      matchReasons: userOpp?.match_reasons || [],
      deadline: opp.deadline ? formatDate(new Date(opp.deadline)) : null,
      postedDate: getRelativeTime(new Date(opp.posted_date)),
      logo: opp.logo,
      skills: opp.skills,
      description: opp.description,
      salary: opp.salary,
      duration: opp.duration,
      remote: opp.remote,
      applicants: opp.applicants,
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
      saved: userOpp?.status === "saved",
    }
  })

  return {
    opportunities: mapped,
    totalCount: count || 0,
    page,
    pageSize,
    hasMore: offset + pageSize < (count || 0),
  }
}

export async function getOpportunitiesByIds(ids: string[]) {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .in("id", ids)

  const opportunities = data as Opportunity[] | null

  if (error) throw new Error(error.message)

  let userOpportunities: Record<string, { match_score: number; match_reasons: unknown; status: string }> =
    {}

  if (authUser) {
    const { data: userOppsData } = await supabase
      .from("user_opportunities")
      .select("opportunity_id, match_score, match_reasons, status")
      .eq("user_id", authUser.id)
      .in("opportunity_id", ids)

    const userOpps = userOppsData as UserOpportunity[] | null

    userOpportunities = (userOpps || []).reduce((acc: any, uo: UserOpportunity) => {
      acc[uo.opportunity_id] = {
        match_score: uo.match_score,
        match_reasons: uo.match_reasons,
        status: uo.status,
      }
      return acc
    }, {} as Record<string, { match_score: number; match_reasons: unknown; status: string }>)
  }

  return (opportunities || []).map((opp: Opportunity) => {
    const userOpp = userOpportunities[opp.id]
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
      matchReasons: userOpp?.match_reasons || [],
      deadline: opp.deadline ? formatDate(new Date(opp.deadline)) : null,
      postedDate: getRelativeTime(new Date(opp.posted_date)),
      logo: opp.logo,
      skills: opp.skills,
      description: opp.description,
      salary: opp.salary,
      duration: opp.duration,
      remote: opp.remote,
      applicants: opp.applicants,
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
      saved: userOpp?.status === "saved",
    }
  })
}

export interface SearchOpportunitiesResult {
  /** Exact matches — both domain AND type match the query */
  exactResults: Awaited<ReturnType<typeof getOpportunities>>["opportunities"]
  /** Related but not exact matches — shown as fallback */
  relatedResults: Awaited<ReturnType<typeof getOpportunities>>["opportunities"]
  /** Whether exact matches were found (controls UI display) */
  hasExactMatches: boolean
  /** The original query for display in the UI */
  query: string
  /** Legacy: combined results for backward compatibility */
  opportunities: Awaited<ReturnType<typeof getOpportunities>>["opportunities"]
  discoveryTriggered: boolean
  newOpportunitiesFound: number
}

export async function searchOpportunities(
  query: string,
  filters?: {
    type?: string
    category?: string
    remote?: boolean
    /** Filter by location type: "Online", "In-Person", "Hybrid" */
    locationType?: string
    /** Filter by grade level — only return opps that include this grade */
    gradeLevel?: number
  }
): Promise<SearchOpportunitiesResult> {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  const sanitizedQuery = query.trim()

  // If no query, return first page of opportunities
  if (!sanitizedQuery) {
    const result = await getOpportunities(filters)
    return {
      exactResults: result.opportunities,
      relatedResults: [],
      hasExactMatches: true,
      query: sanitizedQuery,
      opportunities: result.opportunities,
      discoveryTriggered: false,
      newOpportunitiesFound: 0,
    }
  }

  // ── Parse query into structured components ──
  const parsed = parseSearchQuery(sanitizedQuery)
  console.log(`[Search] Parsed query: domain="${parsed.domainPhrase}", type="${parsed.type}", modifiers=[${parsed.modifiers.join(",")}]`)

  // Get user opportunities for match scores
  let userOpportunities: Record<string, { match_score: number; match_reasons: unknown; status: string }> =
    {}

  if (authUser) {
    const { data: userOppsData } = await supabase
      .from("user_opportunities")
      .select("opportunity_id, match_score, match_reasons, status")
      .eq("user_id", authUser.id)

    const userOpps = userOppsData as UserOpportunity[] | null

    userOpportunities = (userOpps || []).reduce((acc: any, uo: UserOpportunity) => {
      acc[uo.opportunity_id] = {
        match_score: uo.match_score,
        match_reasons: uo.match_reasons,
        status: uo.status,
      }
      return acc
    }, {} as Record<string, { match_score: number; match_reasons: unknown; status: string }>)
  }

  const mapOpp = (opp: Opportunity) => {
    const userOpp = userOpportunities[opp.id]
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
      matchReasons: userOpp?.match_reasons || [],
      deadline: opp.deadline ? formatDate(new Date(opp.deadline)) : null,
      postedDate: getRelativeTime(new Date(opp.posted_date)),
      logo: opp.logo,
      skills: opp.skills,
      description: opp.description,
      salary: opp.salary,
      duration: opp.duration,
      remote: opp.remote,
      applicants: opp.applicants,
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
      saved: userOpp?.status === "saved",
    }
  }

  // Deduplicate + HS-filter + grade-filter helper
  const dedup = (opps: Opportunity[]): Opportunity[] => {
    const seen = new Set<string>()
    let result = filterHsRelevant(opps).filter((opp) => {
      const key = (opp.title || "").trim().toLowerCase()
      if (!key || key === "unknown") return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    // Apply grade level post-filter when specified
    if (filters?.gradeLevel) {
      const grade = filters.gradeLevel
      result = result.filter((opp) => {
        const levels = opp.grade_levels
        if (!levels || levels.length === 0) return true // no restriction = open to all
        return levels.includes(grade)
      })
    }
    return result
  }

  // ──────────────────────────────────────────────
  // TIER 1: Exact match (domain + type in DB)
  // ──────────────────────────────────────────────
  let tier1Results: Opportunity[] = []

  if (parsed.type && parsed.domainPhrase) {
    // Both type AND domain specified — most precise search
    const domainPattern = `%${parsed.domainPhrase}%`
    let t1Query = supabase
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .ilike("type", parsed.type)   // case-insensitive: "volunteer" matches "Volunteer"
      .or(`title.ilike.${domainPattern},description.ilike.${domainPattern},category.ilike.${domainPattern}`)
      .neq("title", "Unknown")
      .neq("title", "")
      .limit(50)

    if (filters?.type) t1Query = t1Query.ilike("type", filters.type)
    if (filters?.category) t1Query = t1Query.eq("category", filters.category)
    if (filters?.remote !== undefined) t1Query = t1Query.eq("remote", filters.remote)
    t1Query = applyLocationTypeFilter(t1Query, filters?.locationType)

    const { data: t1Data } = await t1Query.order("deadline", { ascending: true })
    tier1Results = dedup((t1Data as Opportunity[]) || [])

    console.log(`[Search] Tier 1 (exact domain+type): ${tier1Results.length} results`)
  } else if (parsed.type && !parsed.domainPhrase) {
    // Only type specified (e.g. "volunteering")
    let t1Query = supabase
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .ilike("type", parsed.type)   // case-insensitive: "volunteer" matches "Volunteer"
      .neq("title", "Unknown")
      .neq("title", "")
      .limit(50)

    if (filters?.category) t1Query = t1Query.eq("category", filters.category)
    if (filters?.remote !== undefined) t1Query = t1Query.eq("remote", filters.remote)
    t1Query = applyLocationTypeFilter(t1Query, filters?.locationType)

    const { data: t1Data } = await t1Query.order("deadline", { ascending: true })
    tier1Results = dedup((t1Data as Opportunity[]) || [])

    console.log(`[Search] Tier 1 (type only): ${tier1Results.length} results`)
  } else if (!parsed.type && parsed.domainPhrase) {
    // Only domain specified (e.g. "computer science") — search across all types
    const domainPattern = `%${parsed.domainPhrase}%`
    let t1Query = supabase
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .or(`title.ilike.${domainPattern},description.ilike.${domainPattern},category.ilike.${domainPattern}`)
      .neq("title", "Unknown")
      .neq("title", "")
      .limit(50)

    if (filters?.type) t1Query = t1Query.eq("type", filters.type)
    if (filters?.category) t1Query = t1Query.eq("category", filters.category)
    if (filters?.remote !== undefined) t1Query = t1Query.eq("remote", filters.remote)
    t1Query = applyLocationTypeFilter(t1Query, filters?.locationType)

    const { data: t1Data } = await t1Query.order("deadline", { ascending: true })
    tier1Results = dedup((t1Data as Opportunity[]) || [])

    console.log(`[Search] Tier 1 (domain only): ${tier1Results.length} results`)
  }

  // ──────────────────────────────────────────────
  // TIER 2: Strong match — domain matches, type in text
  // ──────────────────────────────────────────────
  let tier2Results: Opportunity[] = []

  if (tier1Results.length < 5 && parsed.domainPhrase) {
    // Broader domain search — individual words if phrase search yielded few
    const domainWords = parsed.domain.flatMap(d => d.split(/\s+/)).filter(w => w.length >= 3)
    const wordConditions = domainWords
      .flatMap(w => [
        `title.ilike.%${w}%`,
        `category.ilike.%${w}%`,
      ])
      .join(",")

    if (wordConditions) {
      let t2Query = supabase
        .from("opportunities")
        .select("*")
        .eq("is_active", true)
        .or(wordConditions)
        .neq("title", "Unknown")
        .neq("title", "")
        .limit(100)

      if (filters?.type) t2Query = t2Query.eq("type", filters.type)
      if (filters?.category) t2Query = t2Query.eq("category", filters.category)
      if (filters?.remote !== undefined) t2Query = t2Query.eq("remote", filters.remote)
      t2Query = applyLocationTypeFilter(t2Query, filters?.locationType)

      const { data: t2Data } = await t2Query.order("deadline", { ascending: true })
      const t2Raw = dedup((t2Data as Opportunity[]) || [])

      // Score and filter — prioritize domain+type matches
      const tier1Ids = new Set(tier1Results.map(o => o.id))
      const typeTerms = parsed.type ? getTypeSearchTerms(parsed.type) : []

      tier2Results = t2Raw
        .filter(opp => !tier1Ids.has(opp.id)) // exclude Tier 1 results
        .map(opp => {
          const oppText = `${opp.title} ${opp.description} ${opp.category} ${(opp.skills || []).join(" ")}`.toLowerCase()

          let score = 0

          // Domain scoring
          const domainInTitle = scoreDomainMatch(opp.title || "", parsed)
          const domainInDesc = scoreDomainMatch(opp.description || "", parsed)
          const domainInCat = scoreDomainMatch(opp.category || "", parsed)

          score += domainInTitle * 30
          score += domainInDesc * 15
          score += domainInCat * 15

          // Type scoring (if user specified a type)
          if (parsed.type) {
            if (opp.type?.toLowerCase() === parsed.type) {
              score += 40 // DB type column matches exactly
            } else if (typeTerms.some(t => oppText.includes(t))) {
              score += 15 // Type keyword found in text
            } else {
              score -= 15 // Type NOT found — penalty
            }
          }

          return { opp, score }
        })
        .filter(({ score }) => score >= 20)
        .sort((a, b) => b.score - a.score)
        .map(({ opp }) => opp)
        .slice(0, 30)

      console.log(`[Search] Tier 2 (strong match): ${tier2Results.length} results`)
    }
  }

  // ──────────────────────────────────────────────
  // TIER 3: Loose keyword fallback (old behavior)
  // ──────────────────────────────────────────────
  let tier3Results: Opportunity[] = []

  if (tier1Results.length === 0 && tier2Results.length < 3) {
    // Fall back to original loose keyword search
    const searchPattern = `%${sanitizedQuery}%`
    let t3Query = supabase
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .or(`title.ilike.${searchPattern},company.ilike.${searchPattern},category.ilike.${searchPattern}`)
      .neq("title", "Unknown")
      .neq("title", "")
      .limit(50)

    if (filters?.type) t3Query = t3Query.eq("type", filters.type)
    if (filters?.category) t3Query = t3Query.eq("category", filters.category)
    if (filters?.remote !== undefined) t3Query = t3Query.eq("remote", filters.remote)
    t3Query = applyLocationTypeFilter(t3Query, filters?.locationType)

    const { data: t3Data } = await t3Query.order("deadline", { ascending: true })
    const existingIds = new Set([...tier1Results.map(o => o.id), ...tier2Results.map(o => o.id)])
    tier3Results = dedup((t3Data as Opportunity[]) || []).filter(o => !existingIds.has(o.id))

    console.log(`[Search] Tier 3 (loose fallback): ${tier3Results.length} results`)
  }

  // ──────────────────────────────────────────────
  // Assemble exact vs related buckets
  // ──────────────────────────────────────────────
  const exactResults = tier1Results.map(mapOpp)
  const relatedResults = [...tier2Results, ...tier3Results].map(mapOpp)
  const hasExactMatches = exactResults.length > 0

  // Legacy backward-compat: "opportunities" = exact if available, else related
  const opportunities = hasExactMatches ? exactResults : relatedResults

  // ──────────────────────────────────────────────
  // SPELL CORRECTION fallback — try fixing misspellings before triggering discovery
  // ──────────────────────────────────────────────
  if (exactResults.length === 0 && relatedResults.length === 0 && sanitizedQuery.length >= 3) {
    const { corrected, wasChanged } = fuzzyCorrectQuery(sanitizedQuery)

    if (wasChanged) {
      console.log(`[Search] Spell correction: "${sanitizedQuery}" → "${corrected}"`)

      // Re-parse the corrected query
      const correctedParsed = parseSearchQuery(corrected)

      // Re-run Tier 1 with corrected query
      const correctedDomainPattern = correctedParsed.domainPhrase ? `%${correctedParsed.domainPhrase}%` : null

      if (correctedParsed.type || correctedDomainPattern) {
        let corrQuery = supabase
          .from("opportunities")
          .select("*")
          .eq("is_active", true)
          .neq("title", "Unknown")
          .neq("title", "")
          .limit(50)

        if (correctedParsed.type) corrQuery = corrQuery.ilike("type", correctedParsed.type) // case-insensitive
        if (correctedDomainPattern) {
          corrQuery = corrQuery.or(
            `title.ilike.${correctedDomainPattern},description.ilike.${correctedDomainPattern},category.ilike.${correctedDomainPattern}`
          )
        }
        if (filters?.type) corrQuery = corrQuery.ilike("type", filters.type)
        corrQuery = applyLocationTypeFilter(corrQuery, filters?.locationType)

        const { data: corrData } = await corrQuery.order("deadline", { ascending: true })
        const corrResults = dedup((corrData as Opportunity[]) || [])

        if (corrResults.length > 0) {
          console.log(`[Search] Spell correction found ${corrResults.length} results`)
          const corrMapped = corrResults.map(mapOpp)
          return {
            exactResults: corrMapped,
            relatedResults: [],
            hasExactMatches: true,
            query: sanitizedQuery,
            opportunities: corrMapped,
            discoveryTriggered: false,
            newOpportunitiesFound: 0,
          }
        }
      }

      // Also try Tier 3 (loose keyword) with corrected DOMAIN WORDS only
      // (not the full corrected string — that would still include the misspelled type word)
      const domainOnlyPattern = correctedParsed.domainPhrase
        ? `%${correctedParsed.domainPhrase}%`
        : `%${corrected}%`
      let looseCorrQuery = supabase
        .from("opportunities")
        .select("*")
        .eq("is_active", true)
        .or(`title.ilike.${domainOnlyPattern},company.ilike.${domainOnlyPattern},category.ilike.${domainOnlyPattern}`)
        .neq("title", "Unknown")
        .neq("title", "")
        .limit(50)
      looseCorrQuery = applyLocationTypeFilter(looseCorrQuery, filters?.locationType)

      const { data: looseCorrData } = await looseCorrQuery.order("deadline", { ascending: true })
      const looseCorrResults = dedup((looseCorrData as Opportunity[]) || [])

      if (looseCorrResults.length > 0) {
        console.log(`[Search] Spell correction (loose) found ${looseCorrResults.length} results`)
        const looseCorrMapped = looseCorrResults.map(mapOpp)
        return {
          exactResults: looseCorrMapped,
          relatedResults: [],
          hasExactMatches: true,
          query: sanitizedQuery,
          opportunities: looseCorrMapped,
          discoveryTriggered: false,
          newOpportunitiesFound: 0,
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // Discovery trigger if everything is empty (including spell correction)
  // ──────────────────────────────────────────────
  if (exactResults.length === 0 && relatedResults.length === 0 && sanitizedQuery.length >= 3) {
    if (!canTriggerDiscovery(sanitizedQuery)) {
      console.log(`[Search] Discovery cooldown active for "${sanitizedQuery}", skipping`)
      return {
        exactResults: [],
        relatedResults: [],
        hasExactMatches: false,
        query: sanitizedQuery,
        opportunities: [],
        discoveryTriggered: false,
        newOpportunitiesFound: 0,
      }
    }

    markDiscoveryTriggered(sanitizedQuery)
    const discoveryResult = await triggerDiscovery(sanitizedQuery)

    if (discoveryResult.success && discoveryResult.newOpportunities && discoveryResult.newOpportunities > 0) {
      // Fetch newly discovered opportunities by ID (not by text — avoids misspelling mismatch)
      const discoveredIds = discoveryResult.opportunityIds || []
      let newOpps: typeof exactResults = []

      if (discoveredIds.length > 0) {
        const { data: newData } = await supabase
          .from("opportunities")
          .select("*")
          .in("id", discoveredIds)
          .eq("is_active", true)
          .order("deadline", { ascending: true })

        newOpps = dedup((newData as Opportunity[]) || []).map(mapOpp)
      }

      // Also re-run a broader search in case discovery saved results that match
      if (newOpps.length === 0) {
        const searchPattern = `%${sanitizedQuery}%`
        let reQuery = supabase
          .from("opportunities")
          .select("*")
          .eq("is_active", true)
          .or(`title.ilike.${searchPattern},company.ilike.${searchPattern},category.ilike.${searchPattern}`)
          .neq("title", "Unknown")
          .neq("title", "")
          .limit(50)
          .order("deadline", { ascending: true })

        reQuery = applyLocationTypeFilter(reQuery, filters?.locationType)

        const { data: newData } = await reQuery
        newOpps = dedup((newData as Opportunity[]) || []).map(mapOpp)
      }

      return {
        exactResults: newOpps,
        relatedResults: [],
        hasExactMatches: newOpps.length > 0,
        query: sanitizedQuery,
        opportunities: newOpps,
        discoveryTriggered: true,
        newOpportunitiesFound: discoveryResult.newOpportunities,
      }
    }

    return {
      exactResults: [],
      relatedResults: [],
      hasExactMatches: false,
      query: sanitizedQuery,
      opportunities: [],
      discoveryTriggered: true,
      newOpportunitiesFound: 0,
    }
  }

  return {
    exactResults,
    relatedResults,
    hasExactMatches,
    query: sanitizedQuery,
    opportunities,
    discoveryTriggered: false,
    newOpportunitiesFound: 0,
  }
}

export async function getCuratedOpportunities() {
  const authUser = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("user_opportunities")
    .select(
      `
            *,
            opportunity:opportunities (*)
        `
    )
    .eq("user_id", authUser.id)
    .in("status", ["saved", "curated", "applied"])
    .order("created_at", { ascending: false })

  const userOpportunities = data as any[] | null

  if (error) throw new Error(error.message)

  return (userOpportunities || []).map((uo: any) => ({
    id: uo.opportunity.id,
    title: uo.opportunity.title,
    company: uo.opportunity.company,
    location: uo.opportunity.location,
    type: uo.opportunity.type,
    category: uo.opportunity.category,
    matchScore: uo.match_score,
    matchReasons: uo.match_reasons,
    deadline: uo.opportunity.deadline ? formatDate(new Date(uo.opportunity.deadline)) : null,
    logo: uo.opportunity.logo,
    skills: uo.opportunity.skills,
    description: uo.opportunity.description,
    status: uo.status,
    savedAt: uo.created_at,
  }))
}

export async function saveOpportunity(opportunityId: string) {
  const authUser = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase.from("user_opportunities").upsert(
    {
      user_id: authUser.id,
      opportunity_id: opportunityId,
      status: "saved",
      match_score: 0,
      match_reasons: [],
    } as any,
    { onConflict: "user_id,opportunity_id" }
  )

  if (error) throw new Error(error.message)

  revalidatePath("/opportunities")
  return { success: true }
}

export async function dismissOpportunity(opportunityId: string) {
  const authUser = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase.from("user_opportunities").upsert(
    {
      user_id: authUser.id,
      opportunity_id: opportunityId,
      status: "dismissed",
      match_score: 0,
      match_reasons: [],
    } as any,
    { onConflict: "user_id,opportunity_id" }
  )

  if (error) throw new Error(error.message)

  revalidatePath("/opportunities")
  return { success: true }
}

export async function unsaveOpportunity(opportunityId: string) {
  const authUser = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from("user_opportunities")
    .delete()
    .eq("user_id", authUser.id)
    .eq("opportunity_id", opportunityId)

  if (error) throw new Error(error.message)

  revalidatePath("/opportunities")
  return { success: true }
}

// ============================================================================
// PERSONALIZED OPPORTUNITIES — Matching Algorithm
// ============================================================================

interface UserProfile {
  interests: string[]
  career_goals: string | null
  preferred_opportunity_types: string[]
  academic_strengths: string[]
  grade_level: number | null
  location: string | null
  availability: string | null
}

interface MatchResult {
  score: number
  reasons: string[]
}

/**
 * Score a single opportunity against a user profile.
 * Returns 0-100 score and human-readable match reasons.
 *
 * Signals (total up to 100):
 *   - Interest match (0-35): user interests vs opp title/description/category/skills
 *   - Career goal match (0-20): keywords from career_goals vs opp text
 *   - Opportunity type preference (0-15): preferred_opportunity_types vs opp.type
 *   - Academic strength match (0-15): academic_strengths vs opp skills
 *   - Grade level fit (0-10): user grade_level in opp.grade_levels
 *   - Base relevance (5): every active opportunity gets a small base score
 */
function scoreOpportunityLegacy(opp: Opportunity, profile: UserProfile): MatchResult {
  let score = 0
  const reasons: string[] = []

  // Precompute lowercase text fields for the opportunity
  const oppTitle = (opp.title || '').toLowerCase()
  const oppDesc = (opp.description || '').toLowerCase()
  const oppCategory = (opp.category || '').toLowerCase()
  const oppCompany = (opp.company || '').toLowerCase()
  const oppSkills = (opp.skills || []).map((s: string) => s.toLowerCase())
  const oppType = (opp.type || '').toLowerCase()
  const oppText = `${oppTitle} ${oppDesc} ${oppCategory} ${oppCompany} ${oppSkills.join(' ')}`

  // --- 1) Interest match (up to 35 pts) ---
  if (profile.interests && profile.interests.length > 0) {
    let interestHits = 0
    const matchedInterests: string[] = []

    for (const interest of profile.interests) {
      const lowerInterest = interest.toLowerCase()
      // Check if the interest appears in the opportunity's combined text
      if (oppText.includes(lowerInterest)) {
        interestHits++
        matchedInterests.push(interest)
      } else {
        // Fuzzy: check if any word from the interest appears in opp text
        const words = lowerInterest.split(/\s+/).filter(w => w.length > 3)
        for (const word of words) {
          if (oppText.includes(word)) {
            interestHits += 0.5
            matchedInterests.push(interest)
            break
          }
        }
      }
    }

    const interestScore = Math.min(35, Math.round((interestHits / profile.interests.length) * 35))
    score += interestScore
    if (matchedInterests.length > 0) {
      const unique = [...new Set(matchedInterests)]
      reasons.push(`Matches your interest${unique.length > 1 ? 's' : ''} in ${unique.slice(0, 3).join(', ')}`)
    }
  }

  // --- 2) Career goal match (up to 20 pts) ---
  if (profile.career_goals && profile.career_goals.trim().length > 0) {
    const goalWords = profile.career_goals
      .toLowerCase()
      .split(/[\s,;.]+/)
      .filter(w => w.length > 3)
      // Remove common stop words
      .filter(w => !['want', 'become', 'like', 'would', 'with', 'that', 'this', 'have', 'from', 'been', 'into', 'more', 'some'].includes(w))

    let goalHits = 0
    for (const word of goalWords) {
      if (oppText.includes(word)) goalHits++
    }

    if (goalWords.length > 0) {
      const goalScore = Math.min(20, Math.round((goalHits / goalWords.length) * 20))
      score += goalScore
      if (goalHits > 0) {
        reasons.push('Aligns with your career goals')
      }
    }
  }

  // --- 3) Opportunity type preference (up to 15 pts) ---
  if (profile.preferred_opportunity_types && profile.preferred_opportunity_types.length > 0) {
    const prefTypes = profile.preferred_opportunity_types.map(t => t.toLowerCase())
    if (prefTypes.includes(oppType) || prefTypes.some(t => oppType.includes(t) || t.includes(oppType))) {
      score += 15
      reasons.push(`Matches your preferred type: ${opp.type}`)
    }
  }

  // --- 4) Academic strength match (up to 15 pts) ---
  if (profile.academic_strengths && profile.academic_strengths.length > 0) {
    let strengthHits = 0
    const matchedStrengths: string[] = []

    for (const strength of profile.academic_strengths) {
      const lowerStrength = strength.toLowerCase()
      if (oppSkills.some(s => s.includes(lowerStrength) || lowerStrength.includes(s))) {
        strengthHits++
        matchedStrengths.push(strength)
      } else if (oppText.includes(lowerStrength)) {
        strengthHits += 0.5
        matchedStrengths.push(strength)
      }
    }

    const strengthScore = Math.min(15, Math.round((strengthHits / profile.academic_strengths.length) * 15))
    score += strengthScore
    if (matchedStrengths.length > 0) {
      const unique = [...new Set(matchedStrengths)]
      reasons.push(`Leverages your strength in ${unique.slice(0, 2).join(', ')}`)
    }
  }

  // --- 5) Grade level fit (up to 10 pts) ---
  if (profile.grade_level && opp.grade_levels && opp.grade_levels.length > 0) {
    if (opp.grade_levels.includes(profile.grade_level)) {
      score += 10
      reasons.push('Available for your grade level')
    }
  } else if (profile.grade_level && (!opp.grade_levels || opp.grade_levels.length === 0)) {
    // No grade restriction = open to all, small bonus
    score += 5
  }

  // --- 6) Base relevance ---
  score += 5

  // --- 7) Staleness penalty ---
  if (!opp.last_verified) {
    score -= 5 // Never verified (bulk import)
  } else {
    const daysSinceVerified = (Date.now() - new Date(opp.last_verified).getTime()) / 86400000
    if (daysSinceVerified > 30) score -= 3
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    reasons,
  }
}

/**
 * Fetch personalized opportunities using the STAR Engine (Semantic & Trajectory-Aware Ranking).
 * Falls back to legacy keyword scoring if STAR fails (e.g., embedding API down).
 */
export async function getPersonalizedOpportunities(minScore: number = 20): Promise<{
  opportunities: ReturnType<typeof formatOpportunity>[]
  profileComplete: boolean
}> {
  try {
    return await getPersonalizedOpportunitiesStar(minScore)
  } catch (err) {
    console.error("[STAR] Falling back to legacy scoring:", err)
    return await getPersonalizedOpportunitiesLegacy(minScore)
  }
}

/**
 * Legacy: Fetch opportunities personalized for the current user using keyword matching.
 * Kept as fallback if STAR Engine's embedding API is unavailable.
 */
async function getPersonalizedOpportunitiesLegacy(minScore: number = 20): Promise<{
  opportunities: ReturnType<typeof formatOpportunity>[]
  profileComplete: boolean
}> {
  const authUser = await getCurrentUser()
  const supabase = await createClient()

  if (!authUser) {
    return { opportunities: [], profileComplete: false }
  }

  // Fetch user profile
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", authUser.id)
    .single()

  const profile = profileData as UserProfile | null

  if (!profile || (
    (!profile.interests || profile.interests.length === 0) &&
    (!profile.career_goals || profile.career_goals.trim() === '') &&
    (!profile.preferred_opportunity_types || profile.preferred_opportunity_types.length === 0) &&
    (!profile.academic_strengths || profile.academic_strengths.length === 0)
  )) {
    // No profile or completely empty — can't personalize
    return { opportunities: [], profileComplete: false }
  }

  // Build interest-based pre-filter to avoid fetching all 4000+ rows
  // Only fetch opportunities that mention user's interests, strengths, or preferred types
  const filterKeywords: string[] = []
  if (profile.interests) filterKeywords.push(...profile.interests)
  if (profile.academic_strengths) filterKeywords.push(...profile.academic_strengths)
  if (profile.preferred_opportunity_types) filterKeywords.push(...profile.preferred_opportunity_types)

  let personalQuery = supabase
    .from("opportunities")
    .select("*")
    .eq("is_active", true)
    .neq("title", "Unknown")
    .neq("title", "")

  // If we have keywords, pre-filter with OR conditions (title/category/skills matches)
  if (filterKeywords.length > 0) {
    const uniqueKeywords = [...new Set(filterKeywords.map(k => k.toLowerCase()))]
      .slice(0, 10) // Cap at 10 keywords to keep query reasonable
    const orConditions = uniqueKeywords
      .flatMap(kw => [
        `title.ilike.%${kw}%`,
        `category.ilike.%${kw}%`,
        `description.ilike.%${kw}%`,
      ])
      .join(",")
    personalQuery = personalQuery.or(orConditions)
  }

  const { data, error } = await personalQuery
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)

  const rawOpportunities = (data as Opportunity[]) || []

  // Filter to HS-relevant, then deduplicate by title
  const seenTitles = new Set<string>()
  const opportunities = filterHsRelevant(rawOpportunities).filter((opp: Opportunity) => {
    const key = (opp.title || "").trim().toLowerCase()
    if (!key) return false
    if (seenTitles.has(key)) return false
    seenTitles.add(key)
    return true
  })

  // Fetch user_opportunities for saved status
  const { data: userOppsData } = await supabase
    .from("user_opportunities")
    .select("opportunity_id, match_score, match_reasons, status")
    .eq("user_id", authUser.id)

  const userOpps = (userOppsData as UserOpportunity[] | null) || []
  const userOpportunities = userOpps.reduce((acc: any, uo: UserOpportunity) => {
    acc[uo.opportunity_id] = {
      match_score: uo.match_score,
      match_reasons: uo.match_reasons,
      status: uo.status,
    }
    return acc
  }, {} as Record<string, { match_score: number; match_reasons: unknown; status: string }>)

  // Score and filter
  const scored = opportunities
    .map(opp => {
      const { score, reasons } = scoreOpportunityLegacy(opp, profile)
      return { opp, score, reasons }
    })
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score)

  // Map to frontend format with real match scores
  const result = scored.map(({ opp, score, reasons }) => {
    const userOpp = userOpportunities[opp.id]
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
      matchScore: score,
      matchReasons: reasons,
      deadline: opp.deadline ? formatDate(new Date(opp.deadline)) : null,
      postedDate: getRelativeTime(new Date(opp.posted_date)),
      logo: opp.logo,
      skills: opp.skills,
      description: opp.description,
      salary: opp.salary,
      duration: opp.duration,
      remote: opp.remote,
      applicants: opp.applicants,
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
      saved: userOpp?.status === "saved",
    }
  })

  return { opportunities: result, profileComplete: true }
}

// Helper to make the return type inferrable (used in the type above)
function formatOpportunity(opp: any) {
  return opp as any
}

export async function calculateMatchScore(opportunityId: string) {
  const authUser = await requireAuth()
  const supabase = await createClient()

  const { data: user } = await supabase
    .from("users")
    .select("skills, interests, location")
    .eq("id", authUser.id)
    .single()

  if (!user) throw new Error("User not found")

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .single()

  if (!opportunity) throw new Error("Opportunity not found")

  const userData = user as any
  const oppData = opportunity as any

  const userSkills = new Set((userData?.skills || []).map((s: string) => s.toLowerCase()))
  const oppSkills = new Set((oppData?.skills || []).map((s: string) => s.toLowerCase()))

  let overlap = 0
  for (const skill of oppSkills) {
    if (userSkills.has(skill)) overlap++
  }

  const skillScore = oppSkills.size > 0 ? Math.round((overlap / oppSkills.size) * 50) : 25
  const interestBonus = (userData?.interests || []).some((i: string) =>
    oppData?.category?.toLowerCase().includes(i.toLowerCase())
  )
    ? 25
    : 0
  const locationBonus =
    oppData?.remote ||
      (userData?.location && oppData?.location?.toLowerCase().includes(userData.location.toLowerCase()))
      ? 15
      : 0

  const score = Math.min(100, skillScore + interestBonus + locationBonus + 10)

  const reasons: string[] = []
  if (overlap > 0) reasons.push(`${overlap} matching skills`)
  if (interestBonus > 0) reasons.push("Matches your interests")
  if (locationBonus > 0) reasons.push(oppData?.remote ? "Remote opportunity" : "Location match")

  const { error } = await supabase.from("user_opportunities").upsert(
    {
      user_id: authUser.id,
      opportunity_id: opportunityId,
      match_score: score,
      match_reasons: reasons,
      status: "curated",
    } as any,
    { onConflict: "user_id,opportunity_id" }
  )

  if (error) throw new Error(error.message)

  revalidatePath("/opportunities")
  return { score, reasons }
}
