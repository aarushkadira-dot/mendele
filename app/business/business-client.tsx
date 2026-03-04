"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Plus,
  Edit3,
  Globe,
  Presentation,
  Linkedin,
  Users,
  X,
  Loader2,
  Telescope,
  Search,
} from "lucide-react"
import { VitalityScoreWidget } from "@/components/business/vitality-score-widget"
import { FeedbackPanel } from "@/components/business/feedback-panel"
import { StartupCard } from "@/components/business/startup-card"
import { InvestorTab } from "@/components/business/investor-tab"
import { upsertStartupProject } from "@/app/actions/business"
import { toast } from "sonner"
import type { Project, ProjectLink } from "@/lib/projects"
import type { StudentProfile } from "@/types/researcher"

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessClientProps {
  userProject: (Project & { lastUpdateDate?: string | null }) | null
  discoverProjects: (Project & { lastUpdateDate?: string | null })[]
  studentProfile: StudentProfile | null
}

type Tab = "startup" | "investors" | "discover"

const STATUS_OPTIONS = [
  { value: "planning", label: "Idea / Planning" },
  { value: "prototype", label: "Prototype" },
  { value: "active", label: "MVP / Active" },
  { value: "completed", label: "Launched / Shipped" },
]

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public (visible to community)" },
  { value: "private", label: "Private (only you)" },
]

// ─── Startup Form ─────────────────────────────────────────────────────────────

interface StartupFormProps {
  initialData?: Project | null
  onSuccess: (project: Project) => void
  onCancel?: () => void
}

function StartupForm({ initialData, onSuccess, onCancel }: StartupFormProps) {
  const [title, setTitle] = useState(initialData?.title || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [status, setStatus] = useState(initialData?.status || "planning")
  const [visibility, setVisibility] = useState(initialData?.visibility || "public")
  const [tags, setTags] = useState<string[]>(initialData?.tags || [])
  const [tagInput, setTagInput] = useState("")
  const [website, setWebsite] = useState(
    initialData?.links?.find((l) => l.type === "website")?.url || ""
  )
  const [pitchDeck, setPitchDeck] = useState(
    initialData?.links?.find((l) => l.type === "pitch")?.url || ""
  )
  const [linkedin, setLinkedin] = useState(
    initialData?.links?.find((l) => l.type === "linkedin")?.url || ""
  )
  const [submitting, setSubmitting] = useState(false)

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags([...tags, t])
      setTagInput("")
    }
  }

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Startup name is required")
      return
    }
    if (!description.trim()) {
      toast.error("Description is required")
      return
    }

    setSubmitting(true)
    try {
      const links: ProjectLink[] = []
      if (website.trim()) links.push({ type: "website", label: "Website", url: website.trim() })
      if (pitchDeck.trim()) links.push({ type: "pitch", label: "Pitch Deck", url: pitchDeck.trim() })
      if (linkedin.trim()) links.push({ type: "linkedin", label: "LinkedIn Page", url: linkedin.trim() })

      const result = await upsertStartupProject({
        id: initialData?.id,
        title: title.trim(),
        description: description.trim(),
        status,
        visibility,
        tags,
        links,
      })

      if (result.success) {
        toast.success(initialData ? "Startup updated!" : "Startup created!")
        onSuccess(result.project as Project)
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save startup")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-border/50 bg-card p-6">
      <div>
        <h3 className="font-semibold text-base">
          {initialData ? "Edit Startup Profile" : "Build Your Startup Profile"}
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your startup profile is used to compute your Vitality Score and match you with investors.
        </p>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Startup Name *</label>
        <Input
          placeholder="e.g. TutorAI, EcoTrack, StudentFund…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Description *</label>
        <p className="text-xs text-muted-foreground">
          Describe your startup, target customers, problem you solve, and business model. More detail = higher Market Clarity score.
        </p>
        <Textarea
          placeholder="We're building an AI tutoring platform for high school students. Our target customers are parents paying $50/month for personalized STEM prep. The problem: tutors cost $100+/hr and are inaccessible to most students…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          className="resize-none"
        />
        <p className="text-[11px] text-muted-foreground text-right">
          {description.length} chars
        </p>
      </div>

      {/* Stage */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Stage</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                status === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Links (improves Content Signals score)</label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Presentation className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Pitch Deck URL (+10 pts)"
              value={pitchDeck}
              onChange={(e) => setPitchDeck(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Website URL (+6 pts)"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="LinkedIn Page URL (+4 pts)"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Tags / Industry</label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. AI, EdTech, B2C…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          />
          <Button variant="outline" size="sm" onClick={addTag} className="shrink-0">
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button onClick={() => removeTag(tag)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Visibility */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Visibility</label>
        <div className="flex gap-2">
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setVisibility(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                visibility === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !description.trim()}
          className="gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4" />
              {initialData ? "Update Startup" : "Create Startup"}
            </>
          )}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── My Startup Tab ───────────────────────────────────────────────────────────

interface MyStartupTabProps {
  project: (Project & { lastUpdateDate?: string | null }) | null
}

function MyStartupTab({ project: initialProject }: MyStartupTabProps) {
  const [project, setProject] = useState(initialProject)
  const [editing, setEditing] = useState(false)

  const handleSuccess = (newProject: Project) => {
    setProject(newProject as Project & { lastUpdateDate?: string | null })
    setEditing(false)
  }

  // No startup yet
  if (!project || editing) {
    return (
      <div className="space-y-6">
        {!project && !editing && (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Start your startup profile</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Build a Crunchbase-style profile that calculates your Startup Vitality Score
                and connects you with the right investors.
              </p>
            </div>
            <Button
              onClick={() => setEditing(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Startup Profile
            </Button>
          </div>
        )}
        <StartupForm
          initialData={project}
          onSuccess={handleSuccess}
          onCancel={project ? () => setEditing(false) : undefined}
        />
      </div>
    )
  }

  const teamSize = (project.collaborators?.length ?? 0) + 1

  return (
    <div className="space-y-6">
      {/* Startup header */}
      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{project.title}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="capitalize text-xs">
                  {
                    STATUS_OPTIONS.find((s) => s.value === project.status)?.label ??
                    project.status
                  }
                </Badge>
                {project.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => setEditing(true)}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>

        {/* Links */}
        {project.links.length > 0 && (
          <div className="flex items-center gap-3">
            {project.links.map((link) => {
              const Icon =
                link.type === "pitch" ? Presentation
                : link.type === "linkedin" ? Linkedin
                : Globe
              return (
                <a
                  key={link.type}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/50 rounded-lg px-2.5 py-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.type === "pitch" ? "Pitch Deck" : link.type === "linkedin" ? "LinkedIn" : "Website"}
                </a>
              )
            })}
          </div>
        )}

        {/* Team */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>
            {teamSize === 1 ? "Solo founder" : `${teamSize} team members`}
          </span>
          {project.collaborators.length > 0 && (
            <span className="text-xs">
              ({project.collaborators.map((c) => c.name).join(", ")})
            </span>
          )}
        </div>
      </div>

      {/* Vitality Score Widget */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden min-h-[380px]">
        <VitalityScoreWidget projectId={project.id} />
      </div>

      {/* AI Feedback Panel */}
      <FeedbackPanel projectId={project.id} projectTitle={project.title} />
    </div>
  )
}

// ─── Discover Tab ─────────────────────────────────────────────────────────────

interface DiscoverTabProps {
  projects: (Project & { lastUpdateDate?: string | null })[]
}

function DiscoverTab({ projects }: DiscoverTabProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filtered = searchQuery.trim()
    ? projects.filter(
        (p) =>
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : projects

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search startups…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border/50 rounded-xl bg-muted/10">
          <Telescope className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">
            {searchQuery ? "No matching startups" : "No startups yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery
              ? "Try different keywords."
              : "Be the first to create a startup profile in the community."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((project, i) => (
            <StartupCard key={project.id} project={project} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Business Client ─────────────────────────────────────────────────────

export function BusinessClient({
  userProject,
  discoverProjects,
  studentProfile,
}: BusinessClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("startup")

  const tabs: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { id: "startup", label: "My Startup", icon: Building2 },
    { id: "investors", label: "Find Investors", icon: Users },
    { id: "discover", label: "Discover", icon: Telescope },
  ]

  return (
    <div className="container mx-auto px-4 sm:px-6 max-w-7xl py-8 space-y-8">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Business Hub</h1>
        <p className="text-muted-foreground">
          Build your startup profile, get AI investor feedback, and connect with VCs and angels.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border/40">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "discover" && discoverProjects.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {discoverProjects.length}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === "startup" && (
            <MyStartupTab project={userProject} />
          )}
          {activeTab === "investors" && (
            <InvestorTab
              studentProfile={
                studentProfile ?? {
                  name: "Student",
                  grade: "high school",
                  interests: "",
                  skills: "",
                  achievements: "",
                }
              }
            />
          )}
          {activeTab === "discover" && (
            <DiscoverTab projects={discoverProjects} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
