import { NextRequest, NextResponse } from "next/server"
import { googleAI } from "@/lib/ai"
import { createClient } from "@/lib/supabase/server"
import type { ResearchEmailVariation } from "@/types/research"

export const maxDuration = 30

interface EmailRequest {
  labName: string
  piName: string
  researchFocus: string
  studentProfile: {
    name: string
    grade: string
    interests: string
    skills: string
    coursework?: string
    specificExcitement?: string
  }
}

const SYSTEM_PROMPT = `You are an expert at crafting cold emails from high school students to research professors/PIs.

RULES:
- Under 200 words per email
- Frame as genuine curiosity, NOT "I can offer value to your lab"
- Show the student has actually read about the research
- Be specific about what excites them
- Don't be sycophantic or over-the-top
- Include a clear, polite ask (e.g., "Would you be open to a brief conversation?" or "Could I visit your lab?")
- Never claim expertise the student doesn't have
- Sound like a real, thoughtful teenager — not a corporate recruiter

Generate 3 variations:
1. "formal" — Professional but warm. Proper salutation, structured paragraphs.
2. "conversational" — Friendly and natural. More casual tone, shorter sentences.
3. "concise" — Ultra-brief. Gets straight to the point in 3-4 sentences max.

Return ONLY valid JSON, no markdown formatting. Format:
{ "variations": [{ "tone": "formal", "subject": "...", "body": "..." }, { "tone": "conversational", "subject": "...", "body": "..." }, { "tone": "concise", "subject": "...", "body": "..." }] }`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as EmailRequest
    const { labName, piName, researchFocus, studentProfile } = body

    if (!labName || !piName || !studentProfile?.name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const userPrompt = `Write cold emails for this student reaching out to a research lab:

Lab: ${labName}
PI/Professor: ${piName}
Research Focus: ${researchFocus}

Student Profile:
- Name: ${studentProfile.name}
- Grade: ${studentProfile.grade}
- Interests: ${studentProfile.interests}
- Skills: ${studentProfile.skills}
${studentProfile.coursework ? `- Relevant Coursework: ${studentProfile.coursework}` : ""}
${studentProfile.specificExcitement ? `- What specifically excites them: ${studentProfile.specificExcitement}` : ""}

Generate 3 email variations (formal, conversational, concise).`

    const result = await googleAI.complete({
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
      temperature: 0.7,
      maxTokens: 2000,
    })

    const rawContent = Array.isArray(result.content)
      ? result.content.map((p: any) => (typeof p === "string" ? p : p.text ?? "")).join("")
      : String(result.content)
    const jsonStr = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(jsonStr) as { variations: ResearchEmailVariation[] }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("[Email Generator Error]", error)
    return NextResponse.json(
      { error: "Failed to generate email variations" },
      { status: 500 }
    )
  }
}
