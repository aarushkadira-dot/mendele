"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Mail,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Sparkles,
  Send,
} from "@/components/ui/icons"
import type { Opportunity } from "@/types/opportunity"
import type { ResearchEmailVariation } from "@/types/research"

interface EmailGeneratorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  opportunity: Opportunity | null
}

type ToneTab = "formal" | "conversational" | "concise"

const TONE_LABELS: Record<ToneTab, { label: string; description: string }> = {
  formal: { label: "Formal", description: "Professional & structured" },
  conversational: { label: "Conversational", description: "Friendly & natural" },
  concise: { label: "Concise", description: "Brief & direct" },
}

export function EmailGeneratorModal({
  open,
  onOpenChange,
  opportunity,
}: EmailGeneratorModalProps) {
  const [variations, setVariations] = useState<ResearchEmailVariation[]>([])
  const [activeTone, setActiveTone] = useState<ToneTab>("formal")
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [editedBodies, setEditedBodies] = useState<Record<ToneTab, string>>({
    formal: "",
    conversational: "",
    concise: "",
  })

  // Student profile form
  const [studentName, setStudentName] = useState("")
  const [studentGrade, setStudentGrade] = useState("")
  const [studentInterests, setStudentInterests] = useState("")
  const [studentSkills, setStudentSkills] = useState("")
  const [specificExcitement, setSpecificExcitement] = useState("")

  // Auto-generate when the modal opens with a valid opportunity
  useEffect(() => {
    if (open && opportunity) {
      setVariations([])
      setEditedBodies({ formal: "", conversational: "", concise: "" })
      setError(null)
      setActiveTone("formal")
    }
  }, [open, opportunity])

  const generateEmails = async () => {
    if (!opportunity || !studentName.trim()) return

    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch("/api/research/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labName: opportunity.title,
          piName: opportunity.institution || opportunity.company,
          researchFocus: opportunity.researchAreas?.join(", ") || opportunity.category || "general research",
          studentProfile: {
            name: studentName,
            grade: studentGrade,
            interests: studentInterests,
            skills: studentSkills,
            specificExcitement,
          },
        }),
      })

      if (!response.ok) throw new Error("Failed to generate emails")

      const data = await response.json()
      const vars = data.variations as ResearchEmailVariation[]
      setVariations(vars)

      // Populate editable bodies
      const bodies: Record<ToneTab, string> = { formal: "", conversational: "", concise: "" }
      for (const v of vars) {
        if (v.tone in bodies) {
          bodies[v.tone as ToneTab] = v.body
        }
      }
      setEditedBodies(bodies)
    } catch (err) {
      setError("Failed to generate emails. Please try again.")
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const activeVariation = variations.find((v) => v.tone === activeTone)
  const activeSubject = activeVariation?.subject || ""
  const activeBody = editedBodies[activeTone] || ""

  const handleCopy = async () => {
    const text = `Subject: ${activeSubject}\n\n${activeBody}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBodyChange = (value: string) => {
    setEditedBodies((prev) => ({ ...prev, [activeTone]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Mail className="h-5 w-5 text-blue-400" />
            </div>
            Generate Cold Email
          </DialogTitle>
          {opportunity && (
            <p className="text-sm text-muted-foreground mt-1">
              Reaching out to{" "}
              <span className="font-medium text-foreground">
                {opportunity.institution || opportunity.company}
              </span>{" "}
              about {opportunity.title}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Student Profile Form */}
          {variations.length === 0 && !isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium">Tell us about yourself</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name *</Label>
                  <Input
                    id="name"
                    placeholder="Jane Doe"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">Grade Level</Label>
                  <Input
                    id="grade"
                    placeholder="e.g., 11th grade"
                    value={studentGrade}
                    onChange={(e) => setStudentGrade(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="interests">Your Research Interests</Label>
                <Input
                  id="interests"
                  placeholder="e.g., neuroscience, machine learning, molecular biology"
                  value={studentInterests}
                  onChange={(e) => setStudentInterests(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Relevant Skills</Label>
                <Input
                  id="skills"
                  placeholder="e.g., Python, R, lab experience, statistics"
                  value={studentSkills}
                  onChange={(e) => setStudentSkills(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="excitement">What excites you about this lab?</Label>
                <Textarea
                  id="excitement"
                  placeholder="e.g., I read their paper on CRISPR applications in gene therapy and found the methodology fascinating..."
                  value={specificExcitement}
                  onChange={(e) => setSpecificExcitement(e.target.value)}
                  rows={3}
                />
              </div>

              {error && (
                <p className="text-sm text-blue-400">{error}</p>
              )}

              <Button
                className="w-full gap-2    hover: hover: text-white"
                onClick={generateEmails}
                disabled={!studentName.trim() || isGenerating}
              >
                <Sparkles className="h-4 w-4" />
                Generate Email Variations
              </Button>
            </motion.div>
          )}

          {/* Loading State */}
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-blue-400/10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Crafting personalized emails...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI is generating 3 tone variations
                </p>
              </div>
              {/* Shimmer skeleton */}
              <div className="w-full space-y-3 mt-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-4 bg-muted/60 rounded animate-pulse"
                    style={{ width: `${100 - i * 15}%` }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Generated Results */}
          {variations.length > 0 && !isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Tone Tabs */}
              <div className="flex gap-2">
                {(["formal", "conversational", "concise"] as ToneTab[]).map((tone) => (
                  <button
                    key={tone}
                    onClick={() => setActiveTone(tone)}
                    className={`
                      flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border
                      ${
                        activeTone === tone
                          ? "bg-blue-400/10 border-blue-400/30 text-blue-400 dark:text-teal-300"
                          : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/60"
                      }
                    `}
                  >
                    <div className="font-medium">{TONE_LABELS[tone].label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {TONE_LABELS[tone].description}
                    </div>
                  </button>
                ))}
              </div>

              {/* Subject Line */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Subject
                </Label>
                <div className="bg-muted/40 border border-border/40 rounded-xl px-4 py-3 text-sm font-medium">
                  {activeSubject}
                </div>
              </div>

              {/* Editable Email Body */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Email Body
                </Label>
                <Textarea
                  value={activeBody}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  className="min-h-[200px] text-sm leading-relaxed resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant={copied ? "default" : "outline"}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={generateEmails}
                  disabled={isGenerating}
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
