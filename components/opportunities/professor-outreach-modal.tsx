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
  Users,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  BookOpen,
} from "lucide-react"
import type { Opportunity } from "@/types/opportunity"
import type { Professor } from "@/app/api/opportunities/find-professors/route"

interface ProfessorOutreachModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  opportunity: Opportunity | null
}

export function ProfessorOutreachModal({
  open,
  onOpenChange,
  opportunity,
}: ProfessorOutreachModalProps) {
  const [professors, setProfessors] = useState<Professor[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [editedBodies, setEditedBodies] = useState<Record<number, string>>({})
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Student profile form
  const [studentName, setStudentName] = useState("")
  const [studentGrade, setStudentGrade] = useState("")
  const [studentInterests, setStudentInterests] = useState("")
  const [studentSkills, setStudentSkills] = useState("")
  const [specificExcitement, setSpecificExcitement] = useState("")

  useEffect(() => {
    if (open) {
      setProfessors([])
      setEditedBodies({})
      setError(null)
      setExpandedIdx(null)
    }
  }, [open, opportunity])

  const findProfessors = async () => {
    if (!opportunity || !studentName.trim()) return
    setIsLoading(true)
    setError(null)
    setProfessors([])
    setExpandedIdx(null)

    try {
      const response = await fetch("/api/opportunities/find-professors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution: opportunity.company,
          researchArea: opportunity.category || opportunity.type || "research",
          opportunityTitle: opportunity.title,
          studentProfile: {
            name: studentName,
            grade: studentGrade,
            interests: studentInterests,
            skills: studentSkills,
            specificExcitement,
          },
        }),
      })

      if (!response.ok) throw new Error("Failed to find professors")

      const data = await response.json()
      const profs = data.professors as Professor[]
      setProfessors(profs)

      // Pre-populate editable bodies
      const bodies: Record<number, string> = {}
      profs.forEach((p, i) => { bodies[i] = p.coldEmail.body })
      setEditedBodies(bodies)
    } catch (err) {
      setError("Failed to find professors. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async (idx: number) => {
    const prof = professors[idx]
    if (!prof) return
    const text = `Subject: ${prof.coldEmail.subject}\n\n${editedBodies[idx] ?? prof.coldEmail.body}`
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            Find Professors & Email
          </DialogTitle>
          {opportunity && (
            <p className="text-sm text-muted-foreground mt-1">
              Finding researchers at{" "}
              <span className="font-medium text-foreground">{opportunity.company}</span>{" "}
              related to <span className="font-medium text-foreground">{opportunity.title}</span>
            </p>
          )}
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Step 1: Student Profile Form */}
          {professors.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="h-4 w-4 text-blue-400" />
                Tell us about yourself so we can personalize the emails
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pname">Your Name *</Label>
                  <Input
                    id="pname"
                    placeholder="Jane Doe"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pgrade">Grade Level</Label>
                  <Input
                    id="pgrade"
                    placeholder="e.g. 11th grade"
                    value={studentGrade}
                    onChange={(e) => setStudentGrade(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pinterests">Research Interests</Label>
                <Input
                  id="pinterests"
                  placeholder="e.g. computational neuroscience, CRISPR, climate modeling"
                  value={studentInterests}
                  onChange={(e) => setStudentInterests(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pskills">Relevant Skills or Coursework</Label>
                <Input
                  id="pskills"
                  placeholder="e.g. Python, AP Biology, statistics, lab experience"
                  value={studentSkills}
                  onChange={(e) => setStudentSkills(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pexcitement">
                  What excites you about research at {opportunity?.company}?
                </Label>
                <Textarea
                  id="pexcitement"
                  placeholder="e.g. I came across Professor X's paper on neural circuits and found the methodology for tracking spike patterns fascinating..."
                  value={specificExcitement}
                  onChange={(e) => setSpecificExcitement(e.target.value)}
                  rows={3}
                />
              </div>

              {error && <p className="text-sm text-blue-400">{error}</p>}

              <Button
                className="w-full gap-2    hover: hover: text-white"
                onClick={findProfessors}
                disabled={!studentName.trim()}
              >
                <Users className="h-4 w-4" />
                Find Professors at {opportunity?.company}
              </Button>
            </motion.div>
          )}

          {/* Step 2: Loading */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-10 gap-4"
            >
              <div className="h-16 w-16 rounded-full bg-blue-400/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Finding professors at {opportunity?.company}...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI is identifying researchers and writing personalized emails
                </p>
              </div>
              <div className="w-full space-y-3 mt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-1/3" />
                    <div className="h-3 bg-muted/40 rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted/30 rounded animate-pulse w-1/2" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 3: Professor Cards */}
          {professors.length > 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Found {professors.length} researchers at {opportunity?.company}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={findProfessors}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>

              <AnimatePresence>
                {professors.map((prof, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className="border border-border/50 rounded-xl overflow-hidden bg-card"
                  >
                    {/* Professor header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-blue-400/10 flex items-center justify-center shrink-0 text-blue-400 dark:text-blue-400 font-bold text-lg">
                            {prof.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{prof.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {prof.title} · {prof.dept}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 italic">
                              {prof.research}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono text-muted-foreground border-border/50 hidden sm:flex"
                          >
                            {prof.emailFormat}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {expandedIdx === idx ? "Hide" : "View"} Email
                            {expandedIdx === idx ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded email */}
                    <AnimatePresence>
                      {expandedIdx === idx && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border/40">
                            <div className="pt-3">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                                Subject
                              </Label>
                              <div className="mt-1.5 bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-sm font-medium">
                                {prof.coldEmail.subject}
                              </div>
                            </div>

                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                                Email Body (editable)
                              </Label>
                              <Textarea
                                className="mt-1.5 text-sm leading-relaxed resize-none min-h-[160px]"
                                value={editedBodies[idx] ?? prof.coldEmail.body}
                                onChange={(e) =>
                                  setEditedBodies((prev) => ({ ...prev, [idx]: e.target.value }))
                                }
                              />
                            </div>

                            <Button
                              size="sm"
                              variant={copiedIdx === idx ? "default" : "outline"}
                              className="w-full gap-2"
                              onClick={() => handleCopy(idx)}
                            >
                              {copiedIdx === idx ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  Copied to clipboard!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4" />
                                  Copy Subject + Body
                                </>
                              )}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
