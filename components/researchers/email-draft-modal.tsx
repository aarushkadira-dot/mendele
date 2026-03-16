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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, Copy, Check, Loader2, Info } from "lucide-react"
import type { ScoredProfile, StudentProfile } from "@/types/researcher"

interface EmailDraftModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ScoredProfile | null
  studentProfile: StudentProfile
  topic: string
}

export function EmailDraftModal({
  open,
  onOpenChange,
  profile,
  studentProfile,
  topic,
}: EmailDraftModalProps) {
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !profile) return

    setSubject("")
    setBody("")
    setError(null)
    setCopied(false)
    setLoading(true)

    fetch("/api/researchers/draft-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, studentProfile, topic }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to draft email")
        return res.json()
      })
      .then((data) => {
        setSubject(data.subject || "")
        setBody(data.body || "")
      })
      .catch(() => setError("Failed to draft email. Please try again."))
      .finally(() => setLoading(false))
  }, [open, profile?.name])

  const handleCopy = async () => {
    if (!subject && !body) return
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Mail className="h-5 w-5 text-blue-400" />
            </div>
            Draft Email to {profile.name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {profile.title} · {profile.institution}
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-10 gap-3"
            >
              <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              <p className="text-sm text-muted-foreground">Drafting personalized email…</p>
              <div className="w-full space-y-2 mt-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-3 bg-muted/50 rounded animate-pulse"
                    style={{ width: `${70 + i * 8}%` }}
                  />
                ))}
              </div>
            </motion.div>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-4">{error}</p>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Subject */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Subject
                  </Label>
                  <div className="bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-sm font-medium">
                    {subject}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Email Body (editable)
                  </Label>
                  <Textarea
                    className="text-sm leading-relaxed resize-none min-h-[200px]"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>

                {/* Tips */}
                {profile.contact_strategy && (
                  <div className="flex items-start gap-2 rounded-lg bg-blue-400/8 border border-blue-400/15 px-3 py-2.5 text-xs text-blue-400 dark:text-blue-300">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold">Tip: </span>
                      {profile.contact_strategy}
                    </span>
                  </div>
                )}

                {profile.email_hint && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span>
                      Likely email: <span className="font-mono">{profile.email_hint}</span>
                    </span>
                  </div>
                )}

                {/* Copy button */}
                <Button
                  className="w-full gap-2"
                  variant={copied ? "default" : "outline"}
                  onClick={handleCopy}
                  disabled={!body}
                >
                  {copied ? (
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
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
