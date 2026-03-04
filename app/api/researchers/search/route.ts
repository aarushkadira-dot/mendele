import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, createClient } from "@/lib/supabase/server"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"
import { googleAI } from "@/lib/ai/google-model-manager"
import type { ScoredProfile } from "@/types/researcher"

export const maxDuration = 30

const SEARCH_PROMPT = `You are a research advisor helping a high school student find researchers or investors to reach out to about their project.

STUDENT:
Topic: {topic}
Description: {description}
Name: {name} | Grade: {grade} | Interests: {interests} | Skills: {skills}
Achievements: {achievements}

Find {count} real {type} who actively work in this area AND have shown genuine interest in working with high school or undergraduate students (or early-stage founders for investors).

For each person provide:
- name (full name)
- title (e.g. "Professor", "Principal Investigator", "General Partner")
- institution (university or firm name)
- department (department or team)
- type: "researcher" or "investor"
- profile_tier: one of "phd_professor"|"postdoc"|"grad_student"|"partner_vc"|"angel_investor"|"accelerator"
- research_focus (2-3 specific sentences about their work)
- evidence_of_student_work (concrete programs, papers with student co-authors, known mentorship, accelerator batches)
- scores object with integers 0-100:
  - topic_match: how closely their work overlaps the student's topic (30% weight)
  - student_collaboration: track record with HS/undergrad students or young founders (25% weight)
  - availability: estimated openness based on known activity (20% weight)
  - experience_level: PhD professor=90+, postdoc=70, grad_student=50; partner_vc=90+, angel=75, accelerator=65 (15% weight)
  - trend_alignment: whether recent work direction matches topic (10% weight)
- overall_match: weighted average (topic_match*0.30 + student_collaboration*0.25 + availability*0.20 + experience_level*0.15 + trend_alignment*0.10), integer 0-100
- engagement_likelihood: integer 0-100, estimated % chance they reply to a cold email
- years_experience: estimated integer
- active_projects: estimated integer (current workload indicator)
- contact_strategy: ONE specific thing to mention — e.g. "Reference their 2023 Nature paper on X" or "Mention their RSI alumni network"
- email_hint: likely email format, e.g. "firstname.lastname@mit.edu"

RULES:
- Only real, verifiable people — no invented names
- Prefer people with public evidence of student engagement
- For investors: prefer those known to fund or advise student/early-stage founders (e.g. Contrary Capital, Pear VC, Dorm Room Fund)
- Rank results by overall_match descending

Return ONLY valid JSON, no markdown: { "results": [...] }`

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimitKey = createRateLimitKey("SUMMARIZE", `researchers:${user.id}`)
    const { success: withinLimit, remaining, reset, limit } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.SUMMARIZE.limit,
      RATE_LIMITS.SUMMARIZE.windowSeconds
    )

    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      )
    }

    const body = await req.json()
    const { topic, description, type = "researchers", count = 5 } = body

    if (!topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 })
    }

    // Fetch user profile to personalize results
    const supabase = await createClient()
    const [userResult, profileResult, achievementsResult] = await Promise.all([
      (supabase.from("users") as any)
        .select("name,skills,interests")
        .eq("id", user.id)
        .single(),
      (supabase.from("user_profiles") as any)
        .select("grade_level,academic_strengths")
        .eq("user_id", user.id)
        .single(),
      (supabase.from("achievements") as any)
        .select("title,description,category")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ])

    const userData = userResult.data || {}
    const profileData = profileResult.data || {}
    const achievements: any[] = achievementsResult.data || []

    const studentName = userData.name || "A student"
    const grade = profileData.grade_level ? `${profileData.grade_level}th grade` : "high school"
    const interests = (userData.interests || []).join(", ") || "Not specified"
    const skills = (userData.skills || []).join(", ") || "Not specified"
    const achievementsText =
      achievements.length > 0
        ? achievements.map((a) => `${a.title}: ${a.description || ""}`).join("; ")
        : "None listed"

    const typeLabel =
      type === "investors"
        ? "investors (angels, VCs, accelerators)"
        : type === "both"
        ? "researchers AND investors"
        : "academic researchers"

    const prompt = SEARCH_PROMPT
      .replace("{topic}", topic)
      .replace("{description}", description || "(no description provided)")
      .replace("{name}", studentName)
      .replace("{grade}", grade)
      .replace("{interests}", interests)
      .replace("{skills}", skills)
      .replace("{achievements}", achievementsText)
      .replace("{count}", String(Math.min(count, 15)))
      .replace("{type}", typeLabel)

    if (!googleAI) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 })
    }

    const result = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2000,
      temperature: 0.3,
    })

    const rawText = result.text?.trim() ?? ""
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    const results: ScoredProfile[] = (parsed.results || []).map((p: any) => ({
      name: String(p.name || "Unknown"),
      title: String(p.title || ""),
      institution: String(p.institution || ""),
      department: String(p.department || ""),
      type: p.type === "investor" ? "investor" : "researcher",
      profile_tier: p.profile_tier || "phd_professor",
      research_focus: String(p.research_focus || ""),
      evidence_of_student_work: String(p.evidence_of_student_work || ""),
      scores: {
        topic_match: Number(p.scores?.topic_match ?? 0),
        student_collaboration: Number(p.scores?.student_collaboration ?? 0),
        availability: Number(p.scores?.availability ?? 0),
        experience_level: Number(p.scores?.experience_level ?? 0),
        trend_alignment: Number(p.scores?.trend_alignment ?? 0),
      },
      overall_match: Number(p.overall_match ?? 0),
      engagement_likelihood: Number(p.engagement_likelihood ?? 0),
      years_experience: Number(p.years_experience ?? 0),
      active_projects: Number(p.active_projects ?? 0),
      contact_strategy: String(p.contact_strategy || ""),
      email_hint: String(p.email_hint || ""),
    }))

    return NextResponse.json(
      { results },
      {
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    )
  } catch (error: any) {
    console.error("[Researchers Search] Error:", error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
