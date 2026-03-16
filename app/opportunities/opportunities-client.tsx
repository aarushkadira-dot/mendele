"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Sparkles, Bookmark, Send, Filter, Loader2, Globe, X, UserCheck, Users, AlertCircle, MapPin, Wifi, Building2, GraduationCap, ChevronDown, Clock, Archive } from "lucide-react"
import { OpportunityList } from "@/components/opportunities/opportunity-list"
import { ModernOpportunityCard } from "@/components/opportunities/modern-opportunity-card"
import { ExpandedOpportunityCard } from "@/components/opportunities/expanded-opportunity-card"
import { DiscoveryTriggerCard } from "@/components/opportunities/discovery-trigger-card"
import type { LiveOpportunity } from "@/components/discovery/live-opportunity-card"
import { getOpportunities, searchOpportunities, getOpportunitiesByIds, getPersonalizedOpportunities } from "@/app/actions/opportunities"
import { getStatuses, updateStatus, type OpportunityStatus } from "@/app/actions/opportunity-status"
import { getUserProfile } from "@/app/actions/user"
import { useHasMounted } from "@/hooks/use-has-mounted"
import { useDebouncedCallback } from "@/hooks/use-debounced-callback"
import type { Opportunity } from "@/types/opportunity"
import { OPPORTUNITY_TYPES } from "@/types/opportunity"

interface OpportunitiesClientProps {
  initialHighlightId?: string | null
}

const CATEGORIES = [
  "All",
  "Internship",
  "Research",
  "Competition",
  "Program",
  "Fellowship",
  "Scholarship",
  "Volunteer",
]

const LOCATION_TYPES = [
  { value: "all", label: "Any Location", icon: MapPin },
  { value: "Online", label: "Online / Remote", icon: Wifi },
  { value: "In-Person", label: "In-Person", icon: Building2 },
  { value: "Hybrid", label: "Hybrid", icon: Globe },
]

const GRADE_LEVELS = [
  { value: "all", label: "All Grades" },
  { value: "9", label: "9th Grade" },
  { value: "10", label: "10th Grade" },
  { value: "11", label: "11th Grade" },
  { value: "12", label: "12th Grade" },
]

export default function OpportunitiesClient({ initialHighlightId }: OpportunitiesClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")
  const [gradeFilter, setGradeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"current" | "past">("current")
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [statuses, setStatuses] = useState<Record<string, OpportunityStatus>>({})
  const [searchResults, setSearchResults] = useState<Opportunity[] | null>(null)
  const [relatedResults, setRelatedResults] = useState<Opportunity[]>([])
  const [hasExactMatches, setHasExactMatches] = useState(true)
  const [searchQueryDisplay, setSearchQueryDisplay] = useState("")
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isSearching, setIsSearching] = useState(false)
  const [discoveryStatus, setDiscoveryStatus] = useState<{
    triggered: boolean
    newFound: number
  } | null>(null)
  const [userProfileId, setUserProfileId] = useState<string | undefined>()
  const [personalizedDiscovery, setPersonalizedDiscovery] = useState(false)
  const [personalized, setPersonalized] = useState(false) // Main toggle: "For You" vs "All"
  const [personalizedOpportunities, setPersonalizedOpportunities] = useState<Opportunity[]>([])
  const [personalizedLoading, setPersonalizedLoading] = useState(false)
  const [profileComplete, setProfileComplete] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const hasMounted = useHasMounted()
  const router = useRouter()

  const discoveredQueriesRef = useRef<Set<string>>(new Set())

  // Memoize the set of already-loaded opportunity IDs and titles so discovery can skip them
  const existingOpportunityIds = useMemo(() => new Set(opportunities.map((o) => o.id)), [opportunities])
  const existingOpportunityTitles = useMemo(() => new Set(opportunities.map((o) => o.title.trim().toLowerCase())), [opportunities])

  const mapOpportunity = useCallback(
    (opp: any): Opportunity => ({
      id: opp.id,
      title: opp.title,
      company: opp.company,
      location: opp.location,
      type: opp.type,
      matchScore: opp.matchScore || 0,
      matchReasons: opp.matchReasons || [],
      deadline: opp.deadline,
      postedDate: opp.postedDate,
      logo: opp.logo,
      skills: opp.skills || [],
      description: opp.description,
      salary: opp.salary,
      duration: opp.duration,
      remote: opp.remote || false,
      applicants: opp.applicants || 0,
      saved: opp.saved || false,
      category: opp.category,
      suggestedCategory: opp.suggestedCategory,
      gradeLevels: opp.gradeLevels,
      locationType: opp.locationType,
      startDate: opp.startDate,
      endDate: opp.endDate,
      cost: opp.cost,
      timeCommitment: opp.timeCommitment,
      prizes: opp.prizes,
      contactEmail: opp.contactEmail,
      applicationUrl: opp.applicationUrl,
      requirements: opp.requirements,
      sourceUrl: opp.sourceUrl,
      url: opp.url,
      timingType: opp.timingType,
      extractionConfidence: opp.extractionConfidence,
      isActive: opp.isActive,
      isExpired: opp.isExpired,
      lastVerified: opp.lastVerified,
      recheckAt: opp.recheckAt,
      nextCycleExpected: opp.nextCycleExpected,
      dateDiscovered: opp.dateDiscovered,
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
    }),
    []
  )

  useEffect(() => {
    async function fetchOpportunities() {
      try {
        const [result, statusMap] = await Promise.all([
          getOpportunities({ page: 1, pageSize: 50, status: statusFilter }),
          getStatuses()
        ])
        const mapped = result.opportunities.map(mapOpportunity)
        setOpportunities(mapped)
        setHasMore(result.hasMore ?? false)
        setTotalCount(result.totalCount)
        setCurrentPage(1)
        setStatuses(statusMap)
        setLoading(false)

        if (initialHighlightId && mapped.length > 0) {
          const found = mapped.find((o: Opportunity) => o.id === initialHighlightId)
          if (found) {
            setSelectedOpportunity(found)
          }
        }
      } catch (error) {
        console.error("[OpportunitiesPage] Error fetching opportunities:", error)
        setOpportunities([])
        setLoading(false)
      }
    }
    fetchOpportunities()
  }, [mapOpportunity, initialHighlightId, statusFilter])

  // Fetch user profile and personalized opportunities
  useEffect(() => {
    async function fetchProfile() {
      try {
        const profile = await getUserProfile()
        if (profile?.id) {
          setUserProfileId(profile.id)
          setPersonalizedDiscovery(true)
          // Auto-enable personalization if profile has interests
          if (profile.interests && profile.interests.length > 0) {
            setPersonalized(true)
            fetchPersonalizedOpportunities()
          }
        }
      } catch (error) {
        console.error("[OpportunitiesPage] Error fetching profile:", error)
      }
    }
    fetchProfile()
  }, [])

  // Fetch personalized opportunities
  const fetchPersonalizedOpportunities = useCallback(async () => {
    setPersonalizedLoading(true)
    try {
      const result = await getPersonalizedOpportunities(20)
      setProfileComplete(result.profileComplete)
      if (result.profileComplete && result.opportunities.length > 0) {
        setPersonalizedOpportunities(result.opportunities.map(mapOpportunity))
      } else {
        setPersonalizedOpportunities([])
      }
    } catch (error) {
      console.error("[OpportunitiesPage] Error fetching personalized:", error)
      setPersonalizedOpportunities([])
    } finally {
      setPersonalizedLoading(false)
    }
  }, [mapOpportunity])

  // Refetch personalized when toggled on
  useEffect(() => {
    if (personalized && personalizedOpportunities.length === 0 && !personalizedLoading) {
      fetchPersonalizedOpportunities()
    }
  }, [personalized, personalizedOpportunities.length, personalizedLoading, fetchPersonalizedOpportunities])

  const performSearch = useDebouncedCallback(async (query: string, type: string, location: string, grade: string) => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setSearchResults(null)
      setRelatedResults([])
      setHasExactMatches(true)
      setSearchQueryDisplay("")
      setDiscoveryStatus(null)
      setIsSearching(false)
      return
    }

    const queryKey = `${trimmedQuery.toLowerCase()}:${type}:${location}:${grade}`
    const alreadyDiscovered = discoveredQueriesRef.current.has(queryKey)

    setIsSearching(true)
    setDiscoveryStatus(null)

    try {
      const result = await searchOpportunities(trimmedQuery, {
        type: type !== "all" ? type : undefined,
        locationType: location !== "all" ? location : undefined,
        gradeLevel: grade !== "all" ? parseInt(grade) : undefined,
      })

      // Map exact and related results
      const exactMapped = result.exactResults.map(mapOpportunity)
      const relatedMapped = result.relatedResults.map(mapOpportunity)

      setHasExactMatches(result.hasExactMatches)
      setSearchQueryDisplay(result.query || trimmedQuery)

      if (result.hasExactMatches) {
        setSearchResults(exactMapped)
        setRelatedResults([])
      } else {
        setSearchResults([]) // empty exact results
        setRelatedResults(relatedMapped)
      }

      if (result.discoveryTriggered && !alreadyDiscovered) {
        discoveredQueriesRef.current.add(queryKey)
        setDiscoveryStatus({
          triggered: true,
          newFound: result.newOpportunitiesFound,
        })
      }

      if (result.newOpportunitiesFound > 0) {
        const refreshedData = await getOpportunities({ page: 1, pageSize: 50 })
        setOpportunities(refreshedData.opportunities.map(mapOpportunity))
        setHasMore(refreshedData.hasMore ?? false)
        setTotalCount(refreshedData.totalCount)
        setCurrentPage(1)
      }
    } catch (error) {
      console.error("[OpportunitiesPage] Search error:", error)
      setSearchResults(null)
      setRelatedResults([])
      setHasExactMatches(true)
    } finally {
      setIsSearching(false)
    }
  }, 500)

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = currentPage + 1
      const result = await getOpportunities({ page: nextPage, pageSize: 50, status: statusFilter })
      const mapped = result.opportunities.map(mapOpportunity)
      setOpportunities(prev => {
        const existingIds = new Set(prev.map(o => o.id))
        const newOnes = mapped.filter(o => !existingIds.has(o.id))
        return [...prev, ...newOnes]
      })
      setHasMore(result.hasMore ?? false)
      setTotalCount(result.totalCount)
      setCurrentPage(nextPage)
    } catch (error) {
      console.error("[OpportunitiesPage] Error loading more:", error)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, currentPage, mapOpportunity, statusFilter])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (!value.trim()) {
      setRelatedResults([])
      setHasExactMatches(true)
      setSearchQueryDisplay("")
    }
    performSearch(value, typeFilter, locationFilter, gradeFilter)
  }

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value)
    if (searchQuery.trim()) {
      performSearch(searchQuery, value, locationFilter, gradeFilter)
    }
  }

  const handleLocationFilterChange = (value: string) => {
    setLocationFilter(value)
    if (searchQuery.trim()) {
      performSearch(searchQuery, typeFilter, value, gradeFilter)
    }
  }

  const handleGradeFilterChange = (value: string) => {
    setGradeFilter(value)
    if (searchQuery.trim()) {
      performSearch(searchQuery, typeFilter, locationFilter, value)
    }
  }

  const handleStatusChange = async (id: string, status: OpportunityStatus | null) => {
    // Optimistic update
    setStatuses(prev => {
      const next = { ...prev }
      if (status === null) delete next[id]
      else next[id] = status
      return next
    })

    try {
      await updateStatus(id, status)
    } catch (error) {
      console.error("Failed to update status:", error)
      // Revert on failure (could refetch)
    }
  }

  // Helper: check if an opportunity is expired (past deadline or flagged)
  const isOppExpired = useCallback((opp: Opportunity) => {
    if (opp.isExpired) return true
    if (!opp.deadline || opp.deadline === "Rolling") return false
    const d = new Date(opp.deadline)
    return !isNaN(d.getTime()) && d < new Date()
  }, [])

  const displayedOpportunities = useMemo(() => {
    // Status filter applies to all views including search results
    const applyStatusFilter = (list: Opportunity[]) =>
      list.filter((opp) => statusFilter === "current" ? !isOppExpired(opp) : isOppExpired(opp))

    if (searchResults !== null) {
      // If we have exact search results, show them
      if (searchResults.length > 0) return applyStatusFilter(searchResults)
      // If no exact results but have related, show related (banner handled separately)
      if (relatedResults.length > 0) return applyStatusFilter(relatedResults)
      // Both empty — empty state
      return []
    }

    // Use personalized list when toggle is on
    const sourceList = personalized && personalizedOpportunities.length > 0
      ? personalizedOpportunities
      : opportunities

    return sourceList.filter((opp) => {
      const matchesSearch =
        searchQuery === "" ||
        opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.skills.some((skill) => skill.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesType = typeFilter === "all" || opp.type.toLowerCase() === typeFilter.toLowerCase()

      // Status filter (current vs past)
      const matchesStatus = statusFilter === "current" ? !isOppExpired(opp) : isOppExpired(opp)

      // Location type filter (client-side for browsing without search query)
      let matchesLocation = true
      if (locationFilter !== "all") {
        const lt = (opp.locationType || "").toLowerCase()
        if (locationFilter === "Online") {
          matchesLocation = lt.includes("online") || lt.includes("virtual") || lt.includes("remote") || opp.remote
        } else if (locationFilter === "In-Person") {
          matchesLocation = lt.includes("in-person") || lt.includes("in person") || lt.includes("onsite")
        } else if (locationFilter === "Hybrid") {
          matchesLocation = lt.includes("hybrid")
        }
        // If locationType is empty (not set), include it for Online/Hybrid since many online opps don't set this field
        if (!lt && locationFilter === "Online" && opp.remote) matchesLocation = true
      }

      // Grade level filter (client-side for browsing)
      let matchesGrade = true
      if (gradeFilter !== "all") {
        const grade = parseInt(gradeFilter)
        const levels = opp.gradeLevels
        if (levels && levels.length > 0) {
          matchesGrade = levels.includes(grade)
        }
        // If no grade_levels set, keep it (open to all)
      }

      return matchesSearch && matchesType && matchesStatus && matchesLocation && matchesGrade
    })
  }, [opportunities, personalizedOpportunities, personalized, searchResults, relatedResults, searchQuery, typeFilter, statusFilter, locationFilter, gradeFilter, isOppExpired])

  const filteredOpportunities = displayedOpportunities
  const savedOpportunities = useMemo(() => opportunities.filter((o) => o.saved), [opportunities])

  const handleToggleSave = async (id: string) => {
    setOpportunities(opportunities.map((opp) => (opp.id === id ? { ...opp, saved: !opp.saved } : opp)))
    if (selectedOpportunity?.id === id) {
      setSelectedOpportunity((prev) => (prev ? { ...prev, saved: !prev.saved } : null))
    }
  }

  const handleSelectOpportunity = (opp: Opportunity) => {
    setSelectedOpportunity(opp)
  }

  const handleDiscoveryComplete = useCallback(
    async (count: number) => {
      // Discovery completed — don't auto-refresh, user will use Import button
    },
    []
  )

  const handleDiscoveryImport = useCallback(
    async (discoveredOpps: LiveOpportunity[]) => {
      // Fetch these opportunities from the database by ID and add to the list
      const ids = discoveredOpps.map(o => o.id).filter(Boolean)
      if (ids.length === 0) return

      try {
        const newOpportunities = await getOpportunitiesByIds(ids)
        const mapped = newOpportunities.map(mapOpportunity)

        setOpportunities(prev => {
          const existingIds = new Set(prev.map(o => o.id))
          const existingTitles = new Set(prev.map(o => o.title.trim().toLowerCase()))
          const uniqueNew = mapped.filter(o =>
            !existingIds.has(o.id) && !existingTitles.has(o.title.trim().toLowerCase())
          )
          if (uniqueNew.length === 0) return prev
          return [...uniqueNew, ...prev]
        })

        // Also refresh personalized if active
        if (personalized) {
          fetchPersonalizedOpportunities()
        }
      } catch (error) {
        console.error("[OpportunitiesPage] Error importing discovered opportunities:", error)
      }
    },
    [mapOpportunity, personalized, fetchPersonalizedOpportunities]
  )

  const EmptyState = ({ type }: { type: "all" | "saved" | "applied" }) => {
    const configs = {
      all: {
        icon: Sparkles,
        title: "No opportunities found",
        description: "Try adjusting your search or filters to find more opportunities.",
      },
      saved: {
        icon: Bookmark,
        title: "No saved opportunities",
        description: "Save opportunities you're interested in to review them later.",
      },
      applied: {
        icon: Send,
        title: "No applications yet",
        description: "Start applying to opportunities to track your progress.",
      },
    }

    const config = configs[type]
    const Icon = config.icon

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">{config.title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{config.description}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 container mx-auto px-4 sm:px-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading opportunities...</p>
        </div>
      </div>
    )
  }

  return (
    <LayoutGroup>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-transparent"
      >
        {/* --- 1. HERO & SEARCH SECTION --- */}
        <section className="relative pt-12 pb-20 overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 max-w-7xl relative z-10">
            <div className="flex flex-col items-center text-center space-y-4 mb-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary uppercase tracking-widest"
              >
                <Sparkles className="h-3 w-3" />
                Discovery Engine 2.0
              </motion.div>
              <h1 className="text-4xl md:text-6xl font-black text-foreground tracking-tight max-w-3xl leading-[1.1]">
                Your next <span className="text-primary">major milestone</span> starts here.
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Explore personalized research positions, internships, and high-impact programs matched to your unique profile and goals.
              </p>
            </div>

            {/* Floating Search Dock */}
            <div className="max-w-3xl mx-auto -mb-10 relative z-50">
              <GlassCard variant="hero" className="p-2 shadow-2xl border-white/20">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="Role, skill, or achievement..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-12 h-14 bg-transparent border-0 focus:ring-0 text-lg placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <Button
                    variant={personalized ? "default" : "outline"}
                    className={cn(
                      "h-14 px-6 rounded-xl gap-2 font-bold transition-all",
                      personalized && "shadow-lg shadow-primary/20"
                    )}
                    onClick={() => setPersonalized(!personalized)}
                  >
                    {personalized ? <UserCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                    {personalized ? "Matched for You" : "All Results"}
                  </Button>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* Background Decorative Elements */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[60%] bg-primary/5 blur-[120px] rounded-full" />
            <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[50%] bg-blue-400/5 blur-[120px] rounded-full" />
          </div>
        </section>

        {/* --- 2. BENTO HIGHLIGHTS --- */}
        <section className="container mx-auto px-4 sm:px-6 max-w-7xl pb-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <h2 className="text-2xl font-bold tracking-tight">Featured Matches</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="font-bold text-primary">View All Interests</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-3 gap-6 auto-rows-[380px]">
            {filteredOpportunities.slice(0, 3).map((opp, idx) => (
              <div key={opp.id} className={cn(
                "md:col-span-2 lg:col-span-1",
                idx === 0 && "md:col-span-4 lg:col-span-2"
              )}>
                  <ModernOpportunityCard
                    opportunity={opp}
                    isSelected={selectedOpportunity?.id === opp.id}
                    onSelect={handleSelectOpportunity}
                    onToggleSave={(_, id) => handleToggleSave(id)}
                  />
              </div>
            ))}
          </div>
        </section>

        {/* --- 3. FILTER & DISCOVERY BAR --- */}
        <section className="sticky top-4 z-40 container mx-auto px-4 sm:px-6 max-w-7xl py-4 pointer-events-none">
          <div className="pointer-events-auto">
            <GlassCard variant="compact" className="p-1 px-2 flex items-center gap-2 overflow-x-auto scrollbar-none shadow-xl border-white/10">
              <div className="flex items-center gap-1.5 border-r border-white/10 pr-2 mr-2">
                <Filter className="h-4 w-4 text-muted-foreground ml-2" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Filters</span>
              </div>
              
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleTypeFilterChange(cat === "All" ? "all" : cat.toLowerCase())}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                    typeFilter.toLowerCase() === (cat === "All" ? "all" : cat.toLowerCase())
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                      : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                  )}
                >
                  {cat}
                </button>
              ))}
              
              <div className="h-6 w-px bg-white/10 mx-2" />
              
              {LOCATION_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleLocationFilterChange(value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                    locationFilter === value
                      ? "bg-blue-400 text-white border-blue-400 shadow-lg shadow-blue-400/20"
                      : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </GlassCard>
          </div>
        </section>

        {/* --- 4. MAIN FEED --- */}
        <section className="container mx-auto px-4 sm:px-6 max-w-7xl py-12 space-y-12">
          {/* Active Discoveries Trigger */}
          <DiscoveryTriggerCard
            initialQuery={searchQuery}
            onComplete={handleDiscoveryComplete}
            onImport={handleDiscoveryImport}
            personalizedEnabled={personalizedDiscovery}
            onPersonalizedChange={setPersonalizedDiscovery}
            userProfileId={userProfileId}
            existingOpportunityIds={existingOpportunityIds}
            existingOpportunityTitles={existingOpportunityTitles}
          />

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredOpportunities.slice(3).map((opp, idx) => (
                <motion.div
                  key={opp.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <ModernOpportunityCard
                    opportunity={opp}
                    isSelected={selectedOpportunity?.id === opp.id}
                    onSelect={handleSelectOpportunity}
                    onToggleSave={(_, id) => handleToggleSave(id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Infinite Load Mock */}
          {hasMore && (
            <div className="flex justify-center pt-12">
              <Button
                variant="outline"
                size="lg"
                onClick={loadMore}
                disabled={loadingMore}
                className="h-14 px-12 rounded-2xl border-2 font-black gap-2 hover:bg-primary hover:text-white transition-all group"
              >
                {loadingMore ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronDown className="h-5 w-5 group-hover:translate-y-1 transition-transform" />}
                Discover More
              </Button>
            </div>
          )}
        </section>

        {/* Selection Details Drawer */}
        <AnimatePresence>
          {selectedOpportunity && (
            <ExpandedOpportunityCard
              opportunity={selectedOpportunity}
              onClose={() => setSelectedOpportunity(null)}
              onToggleSave={handleToggleSave}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  )
}
