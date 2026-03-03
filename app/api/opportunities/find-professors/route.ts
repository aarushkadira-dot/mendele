import { NextRequest, NextResponse } from "next/server"
import { googleAI } from "@/lib/ai"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 30

interface FindProfessorsRequest {
  institution: string
  researchArea: string
  opportunityTitle: string
  studentProfile: {
    name: string
    grade: string
    interests: string
    skills: string
    specificExcitement?: string
  }
}

export interface Professor {
  name: string
  title: string
  dept: string
  research: string
  emailFormat: string
  coldEmail: {
    subject: string
    body: string
  }
}

const SYSTEM_PROMPT = `You are an expert helping high school students reach out to professors for research opportunities.

Given an institution and research area, suggest 3-4 REAL professors who work there in that field.

For each professor generate:
- A tailored cold email under 180 words
- Frame it as genuine curiosity about their specific work — cite something real they've published or are known for
- Do NOT say "I can offer value" or list accomplishments as leverage
- End with a humble, specific ask: "Would you be open to a brief call?" or "Could I potentially shadow your lab?"
- Sound like a thoughtful, curious high schooler — not a college admissions essay

Return ONLY valid JSON, no markdown. Format:
{
  "professors": [
    {
      "name": "Dr. Jane Smith",
      "title": "Associate Professor",
      "dept": "Department of Biology",
      "research": "One sentence describing their specific research focus",
      "emailFormat": "j.smith@university.edu",
      "coldEmail": {
        "subject": "Subject line here",
        "body": "Full email body here"
      }
    }
  ]
}`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as FindProfessorsRequest
    const { institution, researchArea, opportunityTitle, studentProfile } = body

    if (!institution || !researchArea || !studentProfile?.name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const userPrompt = `Find professors and generate cold emails for this student:

Institution: ${institution}
Research Area: ${researchArea}
Program they were interested in: ${opportunityTitle}

Student Profile:
- Name: ${studentProfile.name}
- Grade: ${studentProfile.grade || "High school student"}
- Interests: ${studentProfile.interests || researchArea}
- Skills: ${studentProfile.skills || "Coursework in related subjects"}
${studentProfile.specificExcitement ? `- What excites them: ${studentProfile.specificExcitement}` : ""}

Generate 3-4 real professors at ${institution} who work in ${researchArea} and write a personalized cold email to each.`

    const result = await googleAI.complete({
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
      temperature: 0.7,
      maxTokens: 3000,
    })

    const rawContent = Array.isArray(result.content)
      ? result.content.map((p: any) => (typeof p === "string" ? p : p.text ?? "")).join("")
      : String(result.content)
    const jsonStr = rawContent
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim()

    const parsed = JSON.parse(jsonStr) as { professors: Professor[] }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("[Find Professors Error]", error)
    return NextResponse.json(
      { error: "Failed to find professors" },
      { status: 500 }
    )
  }
}
