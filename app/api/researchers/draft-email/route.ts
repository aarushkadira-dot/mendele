import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/supabase/server"
import { googleAI } from "@/lib/ai/google-model-manager"
import type { ScoredProfile, StudentProfile } from "@/types/researcher"

export const maxDuration = 20

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { profile, studentProfile, topic }: {
      profile: ScoredProfile
      studentProfile: StudentProfile
      topic: string
    } = body

    if (!profile?.name || !studentProfile?.name) {
      return NextResponse.json({ error: "Missing profile or studentProfile" }, { status: 400 })
    }

    if (!googleAI) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 })
    }

    const tierWordCount: Record<string, string> = {
      phd_professor: "≤180 words, formal, research-focused — cite their specific published work",
      postdoc: "≤150 words, collegial, collaborative framing",
      grad_student: "≤150 words, collegial, peer-to-peer tone",
      partner_vc: "≤160 words, business-focused, lead with impact and scalability",
      angel_investor: "≤160 words, business-focused, mention traction or key insight",
      accelerator: "≤150 words, structured, explicitly mention program fit",
    }

    const toneRules = tierWordCount[profile.profile_tier] || "≤160 words, professional"

    const prompt = `Draft a cold outreach email from a high school student to ${profile.name} (${profile.profile_tier.replace(/_/g, " ")}).

RECIPIENT:
Name: ${profile.name}
Title: ${profile.title} at ${profile.institution}
Their work: ${profile.research_focus}
Contact strategy: ${profile.contact_strategy}

STUDENT:
Name: ${studentProfile.name} | Grade: ${studentProfile.grade}
Topic/Project: ${topic}
Interests: ${studentProfile.interests}
Skills: ${studentProfile.skills}
Achievements: ${studentProfile.achievements}

TONE: ${toneRules}

RULES:
- Sound like a thoughtful, curious high schooler — not a college admissions essay
- Reference their specific work using the contact_strategy above
- Do NOT list accomplishments as leverage — frame as genuine curiosity
- End with a humble specific ask: "Would you be open to a 15-minute call?" or similar
- Do NOT say "I can offer value"

Output ONLY valid JSON, no markdown: { "subject": "...", "body": "..." }`

    const result = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 500,
      temperature: 0.5,
    })

    const rawText = result.text?.trim() ?? ""
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)

    return NextResponse.json({
      subject: String(parsed.subject || ""),
      body: String(parsed.body || ""),
    })
  } catch (error: any) {
    console.error("[Draft Email] Error:", error)
    return NextResponse.json({ error: "Failed to draft email" }, { status: 500 })
  }
}
