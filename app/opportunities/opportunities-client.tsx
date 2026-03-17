"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
        setHasMore(result.hasMore)
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
        setHasMore(refreshedData.hasMore)
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
      setHasMore(result.hasMore)
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
      <div className="page-container">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          <p className="text-body-sm text-muted-foreground">Loading opportunities...</p>
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
        <section className="pt-8 pb-12">
          <div className="page-container !py-0">
            <div className="flex flex-col items-center text-center space-y-3 mb-10">
              <Badge variant="outline" className="border-primary/20 text-primary text-label-sm gap-1.5 px-3 py-1">
                <Sparkles className="h-3 w-3" />
                Discovery Engine
              </Badge>
              <h1 className="text-display text-foreground max-w-2xl">
                Your next <span className="text-primary">opportunity</span> starts here.
              </h1>
              <p className="text-body text-muted-foreground max-w-xl">
                Explore personalized research positions, internships, and programs matched to your profile.
              </p>
            </div>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <Card className="border-border bg-card p-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="Role, skill, or achievement..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-10 h-11 bg-transparent border-0 focus:ring-0 text-sm"
                    />
                  </div>
                  <Button
                    variant={personalized ? "default" : "outline"}
                    className={cn(
                      "h-9 px-4 gap-2 text-xs font-semibold",
                    )}
                    onClick={() => setPersonalized(!personalized)}
                  >
                    {personalized ? <UserCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    {personalized ? "For You" : "All"}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* --- 2. BENTO HIGHLIGHTS --- */}
        <section className="page-container !pt-0 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="h-6 w-0.5 bg-primary rounded-full" />
              <h2 className="text-title">Featured Matches</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-primary text-caption font-semibold">View All</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-3 gap-4 auto-rows-[360px]">
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
        <section className="sticky top-14 z-40 page-container !py-3 pointer-events-none">
          <div className="pointer-events-auto">
            <Card className="border-border bg-card/95 backdrop-blur-sm p-1.5 px-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
              <div className="flex items-center gap-1.5 border-r border-border pr-2 mr-1">
                <Filter className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                <span className="text-label-sm text-muted-foreground">Filters</span>
              </div>
              
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleTypeFilterChange(cat === "All" ? "all" : cat.toLowerCase())}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap border",
                    typeFilter.toLowerCase() === (cat === "All" ? "all" : cat.toLowerCase())
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-accent"
                  )}
                >
                  {cat}
                </button>
              ))}
              
              <div className="h-5 w-px bg-border mx-1" />
              
              {LOCATION_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleLocationFilterChange(value)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap border",
                    locationFilter === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-accent"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </Card>
          </div>
        </section>

        {/* --- 4. MAIN FEED --- */}
        <section className="page-container !pt-4 space-y-8">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
            <div className="flex justify-center pt-6">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
                className="h-9 px-6 gap-2 text-sm font-medium"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                Load More
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
