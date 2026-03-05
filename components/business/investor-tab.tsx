"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Loader2,
  Building2,
  RotateCcw,
  Bookmark,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react"
import { ResearcherCard } from "@/components/researchers/researcher-card"
import { getSavedResearchers } from "@/app/actions/researchers"
import { toast } from "sonner"
import type { ScoredProfile, StudentProfile } from "@/types/researcher"

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-muted/60" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded bg-muted/60" />
          <div className="h-3 w-3/4 rounded bg-muted/40" />
        </div>
        <div className="h-10 w-12 rounded-lg bg-muted/40" />
      </div>
      <div className="flex gap-2">
        <div className="h-5 w-20 rounded-full bg-muted/40" />
        <div className="h-5 w-24 rounded-full bg-muted/40" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted/30" />
        <div className="h-3 w-5/6 rounded bg-muted/30" />
        <div className="h-3 w-4/6 rounded bg-muted/30" />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface InvestorTabProps {
  studentProfile: StudentProfile
}

export function InvestorTab({ studentProfile }: InvestorTabProps) {
  const [topic, setTopic] = useState("")
  const [description, setDescription] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [minEngagement, setMinEngagement] = useState(0)

  const [results, setResults] = useState<ScoredProfile[]>([])
  const [savedProfiles, setSavedProfiles] = useState<Partial<ScoredProfile>[]>([])
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"results" | "saved">("results")
  const [currentCount, setCurrentCount] = useState(5)

  // Load saved investors on mount
  useEffect(() => {
    getSavedResearchers()
      .then((profiles) => {
        const investorProfiles = profiles.filter(
          (p) => ["partner_vc", "angel_investor", "accelerator"].includes(p.profile_tier || "")
        )
        setSavedProfiles(investorProfiles)
        setSavedNames(new Set(investorProfiles.map((p) => p.name || "")))
      })
      .catch(() => {})
  }, [])

  const doSearch = async (count: number, append = false) => {
    if (!topic.trim()) {
      toast.error("Please enter a topic or startup description first")
      return
    }

    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/business/investors/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, description, count }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Search failed")
      }

      const data = await res.json()
      const newResults: ScoredProfile[] = data.results || []

      const filtered = minEngagement > 0
        ? newResults.filter((p) => p.engagement_likelihood >= minEngagement)
        : newResults

      if (append) {
        setResults((prev) => {
          const existing = new Set(prev.map((p) => p.name))
          return [...prev, ...filtered.filter((p) => !existing.has(p.name))]
        })
      } else {
        setResults(filtered)
        setHasSearched(true)
      }
    } catch (err: any) {
      setError(err.message || "Search failed. Try again.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleSearch = () => {
    setCurrentCount(5)
    doSearch(5)
  }

  const handleLoadMore = () => {
    const nextCount = currentCount + 5
    setCurrentCount(nextCount)
    doSearch(nextCount, true)
  }

  const handleSaved = (name: string) => {
    setSavedNames((prev) => new Set([...prev, name]))
  }

  return (
    <div className="space-y-6">
      {/* Search panel */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Find Investors for Your Startup</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI-powered matching with angels, VCs, and accelerators who invest in early-stage student founders.
          </p>
        </div>

        {/* Topic */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Your startup or project focus</label>
          <Textarea
            placeholder="e.g. AI-powered tutoring platform for high schoolers, climate-fintech for Gen Z…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Optional description */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            More context{" "}
            <span className="font-normal">(optional — improves matching)</span>
          </label>
          <Textarea
            placeholder="What stage are you at? What traction do you have? Any notable achievements?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Filters */}
        <div>
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-3">
                  <div className="flex items-center gap-4">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">
                      Min. reply rate:{" "}
                      <span className="font-medium text-foreground">{minEngagement}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={10}
                      value={minEngagement}
                      onChange={(e) => setMinEngagement(Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Button
          className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
          onClick={handleSearch}
          disabled={loading || !topic.trim()}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding investors…
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Find Investors
            </>
          )}
        </Button>
      </div>

      {/* Tabs */}
      {(hasSearched || savedProfiles.length > 0) && (
        <div className="flex items-center gap-1 border-b border-border/40">
          <button
            onClick={() => setActiveTab("results")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "results"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Results
            {results.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {results.length}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "saved"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Saved
            {savedProfiles.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {savedProfiles.length}
              </Badge>
            )}
          </button>
        </div>
      )}

      {/* Results tab */}
      {activeTab === "results" && (
        <div className="space-y-6">
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-16 border border-dashed border-border/50 rounded-xl bg-muted/10">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={handleSearch}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && hasSearched && results.length === 0 && (
            <div className="text-center py-16 border border-dashed border-border/50 rounded-xl bg-muted/10">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No investors found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try broadening your startup description or lowering the reply rate filter.
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <AnimatePresence mode="popLayout">
                  {results.map((profile, i) => (
                    <motion.div
                      key={profile.name}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      layout
                    >
                      <ResearcherCard
                        profile={profile}
                        isSaved={savedNames.has(profile.name)}
                        onSaved={handleSaved}
                        studentProfile={studentProfile}
                        topic={topic}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    "Load 5 more"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Saved tab */}
      {activeTab === "saved" && (
        <div className="space-y-4">
          {savedProfiles.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border/50 rounded-xl bg-muted/10">
              <Bookmark className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No saved investors yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Bookmark investor profiles from your search results to follow up later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {savedProfiles.map((p, i) => (
                <motion.div
                  key={p.name ?? i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 font-bold text-emerald-600 text-base">
                        {(p.name || "?").charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.institution}</p>
                      </div>
                      {p.overall_match != null && (
                        <span className="text-sm font-bold tabular-nums text-primary">
                          {p.overall_match}%
                        </span>
                      )}
                    </div>
                    {p.research_focus && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pl-12">
                        {p.research_focus}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
