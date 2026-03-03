"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Sparkles,
  FlaskConical,
  Loader2,
  X,
  Globe,
  MapPin,
  GraduationCap,
  Inbox,
} from "lucide-react"
import { ResearchCard } from "@/components/research/research-card"
import { ExpandedResearchCard } from "@/components/research/expanded-research-card"
import { EmailGeneratorModal } from "@/components/research/email-generator-modal"
import { ResearchTracker } from "@/components/research/research-tracker"
import {
  getResearchOpportunities,
  semanticSearchResearch,
  saveResearchLab,
  unsaveResearchLab,
  getTrackedLabs,
} from "@/app/actions/research"
import { useDebouncedCallback } from "@/hooks/use-debounced-callback"
import { useHasMounted } from "@/hooks/use-has-mounted"
import type { Opportunity } from "@/types/opportunity"
import type { ResearchTrackingStatus } from "@/types/research"
import { RESEARCH_FOCUS_AREAS } from "@/types/research"

const LOCATION_TYPES = [
  { value: "all", label: "Any Location" },
  { value: "Online", label: "Online" },
  { value: "In-Person", label: "In-Person" },
  { value: "Hybrid", label: "Hybrid" },
]

const GRADE_LEVELS = [
  { value: 0, label: "All Grades" },
  { value: 9, label: "9th" },
  { value: 10, label: "10th" },
  { value: 11, label: "11th" },
  { value: 12, label: "12th" },
]

interface TrackedLab extends Opportunity {
  researchStatus: ResearchTrackingStatus
  trackedAt: string
}

export default function ResearchClient() {
  const hasMounted = useHasMounted()

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [focusAreaFilter, setFocusAreaFilter] = useState<string | null>(null)
  const [locationFilter, setLocationFilter] = useState("all")
  const [gradeFilter, setGradeFilter] = useState(0)

  // Data state
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [searchResults, setSearchResults] = useState<
    Array<{ opportunity: Opportunity; relevanceScore: number; matchExplanation: string }> | null
  >(null)
  const [trackedLabs, setTrackedLabs] = useState<TrackedLab[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTarget, setEmailTarget] = useState<Opportunity | null>(null)
  const [activeTab, setActiveTab] = useState("discover")
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  // Initial load
  useEffect(() => {
    loadOpportunities()
    loadTrackedLabs()
  }, [])

  const loadOpportunities = async (pageNum = 1, append = false) => {
    try {
      if (!append) setLoading(true)
      const result = await getResearchOpportunities({
        focusArea: focusAreaFilter || undefined,
        locationType: locationFilter !== "all" ? locationFilter : undefined,
        gradeLevel: gradeFilter || undefined,
        page: pageNum,
        pageSize: 50,
      })

      if (append) {
        setOpportunities((prev) => [...prev, ...result.opportunities])
      } else {
        setOpportunities(result.opportunities)
      }
      setHasMore(result.hasMore)
      setTotalCount(result.totalCount)
      setPage(pageNum)
    } catch (error) {
      console.error("Failed to load research opportunities:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadTrackedLabs = async () => {
    try {
      const result = await getTrackedLabs()
      setTrackedLabs(result.labs as TrackedLab[])
    } catch (error) {
      console.error("Failed to load tracked labs:", error)
    }
  }

  // Re-fetch when filters change
  useEffect(() => {
    if (!hasMounted) return
    if (searchQuery.trim()) return // don't re-fetch browse results while searching
    loadOpportunities()
  }, [focusAreaFilter, locationFilter, gradeFilter, hasMounted])

  // Semantic search
  const performSearch = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const result = await semanticSearchResearch(query)
      setSearchResults(result.results)
    } catch (error) {
      console.error("Semantic search failed:", error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, 600)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (value.trim()) {
      setIsSearching(true)
      performSearch(value)
    } else {
      setSearchResults(null)
      setIsSearching(false)
    }
  }

  // Save/unsave
  const handleToggleSave = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSaving((prev) => new Set(prev).add(id))

    try {
      const opp =
        opportunities.find((o) => o.id === id) ||
        searchResults?.find((r) => r.opportunity.id === id)?.opportunity

      if (opp?.saved) {
        await unsaveResearchLab(id)
      } else {
        await saveResearchLab(id)
      }

      // Update local state
      const updateSaved = (o: Opportunity) =>
        o.id === id ? { ...o, saved: !o.saved } : o

      setOpportunities((prev) => prev.map(updateSaved))
      setSearchResults((prev) =>
        prev?.map((r) => ({
          ...r,
          opportunity: updateSaved(r.opportunity),
        })) || null
      )

      if (selectedOpportunity?.id === id) {
        setSelectedOpportunity((prev) => (prev ? { ...prev, saved: !prev.saved } : null))
      }

      // Reload tracked labs
      await loadTrackedLabs()
    } catch (error) {
      console.error("Failed to toggle save:", error)
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Email generator
  const handleGenerateEmail = (e: React.MouseEvent, opportunity: Opportunity) => {
    e.stopPropagation()
    setEmailTarget(opportunity)
    setEmailModalOpen(true)
  }

  const handleGenerateEmailFromExpanded = (opportunity: Opportunity) => {
    setSelectedOpportunity(null)
    setEmailTarget(opportunity)
    setEmailModalOpen(true)
  }

  // Tracker status change
  const handleTrackerStatusChange = (labId: string, newStatus: ResearchTrackingStatus) => {
    setTrackedLabs((prev) =>
      prev.map((l) => (l.id === labId ? { ...l, researchStatus: newStatus } : l))
    )
  }

  const handleTrackerLabClick = (lab: TrackedLab) => {
    setSelectedOpportunity(lab)
  }

  // Load more
  const handleLoadMore = () => {
    loadOpportunities(page + 1, true)
  }

  // What to display
  const displayResults = searchResults
    ? searchResults.map((r) => r.opportunity)
    : opportunities

  // Client-side location/grade filtering for search results
  const filteredResults = useMemo(() => {
    let filtered = displayResults

    if (searchResults && locationFilter !== "all") {
      filtered = filtered.filter((opp) => {
        const lt = (opp.locationType || "").toLowerCase()
        if (locationFilter === "Online") {
          return lt.includes("online") || lt.includes("virtual") || lt.includes("remote") || opp.remote
        }
        if (locationFilter === "In-Person") {
          return lt.includes("in-person") || lt.includes("in person") || lt.includes("onsite")
        }
        if (locationFilter === "Hybrid") {
          return lt.includes("hybrid")
        }
        return true
      })
    }

    if (searchResults && gradeFilter > 0) {
      filtered = filtered.filter((opp) => {
        if (!opp.gradeLevels || opp.gradeLevels.length === 0) return true
        return opp.gradeLevels.includes(gradeFilter)
      })
    }

    return filtered
  }, [displayResults, searchResults, locationFilter, gradeFilter])

  if (!hasMounted) return null

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <GlassCard className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Research Labs</h1>
              <p className="text-sm text-muted-foreground">
                AI-powered lab finder for high school students
              </p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {totalCount} programs
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="discover" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Discover
            </TabsTrigger>
            <TabsTrigger value="my-labs" className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" />
              My Labs
              {trackedLabs.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 h-4">
                  {trackedLabs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ──── Discover Tab ──── */}
          <TabsContent value="discover" className="mt-6 space-y-5">
            {/* Search Bar */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                {isSearching ? (
                  <Loader2 className="h-5 w-5 text-teal-500 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5 text-teal-500" />
                )}
              </div>
              <Input
                placeholder="Describe your research interests... (e.g., 'I love neuroscience and coding')"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-12 pr-10 h-12 text-base bg-background/60 border-border/50 focus:border-teal-500/50 focus:ring-teal-500/20"
              />
              {searchQuery && (
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => handleSearchChange("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Focus Area Chips */}
            <div className="flex flex-wrap gap-2">
              {RESEARCH_FOCUS_AREAS.map((area) => (
                <button
                  key={area}
                  onClick={() => {
                    setFocusAreaFilter(focusAreaFilter === area ? null : area)
                    setSearchResults(null)
                    setSearchQuery("")
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                    focusAreaFilter === area
                      ? "bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-300"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {area}
                </button>
              ))}
            </div>

            {/* Location & Grade Filter Pills */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex gap-1">
                  {LOCATION_TYPES.map((lt) => (
                    <button
                      key={lt.value}
                      onClick={() => setLocationFilter(lt.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200",
                        locationFilter === lt.value
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      {lt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-4 w-px bg-border/50" />

              <div className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex gap-1">
                  {GRADE_LEVELS.map((gl) => (
                    <button
                      key={gl.value}
                      onClick={() => setGradeFilter(gl.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200",
                        gradeFilter === gl.value
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      {gl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Searching indicator */}
            {isSearching && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 px-4 py-3 bg-teal-500/5 border border-teal-500/15 rounded-xl"
              >
                <Loader2 className="h-4 w-4 text-teal-500 animate-spin" />
                <span className="text-sm text-teal-700 dark:text-teal-300">
                  AI is analyzing your research interests...
                </span>
              </motion.div>
            )}

            {/* Search Results Info */}
            {searchResults && !isSearching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-teal-500" />
                <span>
                  Found <strong className="text-foreground">{filteredResults.length}</strong>{" "}
                  matching programs for &quot;{searchQuery}&quot;
                </span>
              </div>
            )}

            {/* Results Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-[360px] bg-muted/30 rounded-xl animate-pulse border border-border/20"
                  />
                ))}
              </div>
            ) : filteredResults.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Programs Found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {searchQuery
                    ? "Try different keywords or broaden your search terms."
                    : "Try adjusting your filters to see more results."}
                </p>
              </motion.div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredResults.map((opp) => {
                    const searchResult = searchResults?.find(
                      (r) => r.opportunity.id === opp.id
                    )
                    return (
                      <ResearchCard
                        key={opp.id}
                        opportunity={opp}
                        relevanceScore={searchResult?.relevanceScore}
                        isSelected={selectedOpportunity?.id === opp.id}
                        onSelect={setSelectedOpportunity}
                        onToggleSave={handleToggleSave}
                        onGenerateEmail={handleGenerateEmail}
                        saving={saving.has(opp.id)}
                      />
                    )
                  })}
                </div>

                {/* Load More */}
                {!searchResults && hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleLoadMore}
                      className="gap-2"
                    >
                      Load More Programs
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ──── My Labs Tab ──── */}
          <TabsContent value="my-labs" className="mt-6">
            <ResearchTracker
              labs={trackedLabs}
              onStatusChange={handleTrackerStatusChange}
              onLabClick={handleTrackerLabClick}
            />
          </TabsContent>
        </Tabs>
      </GlassCard>

      {/* Expanded Card Modal */}
      <AnimatePresence>
        {selectedOpportunity && (
          <ExpandedResearchCard
            opportunity={selectedOpportunity}
            onClose={() => setSelectedOpportunity(null)}
            onToggleSave={(id) => {
              const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent
              handleToggleSave(syntheticEvent, id)
            }}
            onGenerateEmail={handleGenerateEmailFromExpanded}
          />
        )}
      </AnimatePresence>

      {/* Email Generator Modal */}
      <EmailGeneratorModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        opportunity={emailTarget}
      />
    </div>
  )
}
