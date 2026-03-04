import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, createClient } from "@/lib/supabase/server"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"
import { googleAI } from "@/lib/ai/google-model-manager"

export interface InsightPayload {
  headline: string
  tip: string
  insight_type: "eligibility_boost" | "strategy_tip" | "strong_match" | "stretch_goal"
}

// In-memory cache: keyed by `${userId}:${opportunityId}`, TTL 30 minutes
const insightCache = new Map<string, { insight: InsightPayload | null; ts: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

function getCached(key: string): InsightPayload | null | undefined {
  const entry = insightCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    insightCache.delete(key)
    return undefined
  }
  return entry.insight
}

function setCached(key: string, insight: InsightPayload | null) {
  // Keep cache bounded — evict oldest entries if over 200
  if (insightCache.size >= 200) {
    const firstKey = insightCache.keys().next().value
    if (firstKey) insightCache.delete(firstKey)
  }
  insightCache.set(key, { insight, ts: Date.now() })
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Rate limit
    const rateLimitKey = createRateLimitKey("INSIGHT", user.id)
    const { success: withinLimit, remaining, reset, limit } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.INSIGHT.limit,
      RATE_LIMITS.INSIGHT.windowSeconds
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

    // 3. Parse body
    const body = await req.json()
    const { opportunityId } = body
    if (!opportunityId) {
      return NextResponse.json({ error: "Missing opportunityId" }, { status: 400 })
    }

    // 4. Cache check
    const cacheKey = `${user.id}:${opportunityId}`
    const cached = getCached(cacheKey)
    if (cached !== undefined) {
      return NextResponse.json({ insight: cached, cached: true })
    }

    // 5. Fetch opportunity + user profile in parallel
    const supabase = await createClient()

    const [oppResult, userResult, profileResult, projectsResult, achievementsResult, ecsResult] =
      await Promise.all([
        (supabase.from("opportunities") as any)
          .select("id,title,company,type,description,requirements,location,location_type,grade_levels,deadline,match_score")
          .eq("id", opportunityId)
          .single(),
        (supabase.from("users") as any)
          .select("name,location,university,skills,interests")
          .eq("id", user.id)
          .single(),
        (supabase.from("user_profiles") as any)
          .select("grade_level,career_goals,academic_strengths,school")
          .eq("user_id", user.id)
          .single(),
        (supabase.from("projects") as any)
          .select("title,description,category,status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        (supabase.from("achievements") as any)
          .select("title,description,issuer")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        (supabase.from("extracurriculars") as any)
          .select("title,role,organization,description")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ])

    if (oppResult.error || !oppResult.data) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 })
    }

    const opp = oppResult.data
    const userData = userResult.data || {}
    const profileData = profileResult.data || {}
    const projects: any[] = projectsResult.data || []
    const achievements: any[] = achievementsResult.data || []
    const ecs: any[] = ecsResult.data || []

    // 6. Build profile text sections
    const school = profileData.school || userData.university || "Unknown school"
    const location = userData.location || profileData.school || "Unknown location"
    const gradeLevel = profileData.grade_level ? `${profileData.grade_level}th` : "Unknown"
    const interests = (userData.interests || []).join(", ") || "Not specified"
    const skills = (userData.skills || []).join(", ") || "Not specified"
    const strengths = (profileData.academic_strengths || []).join(", ") || "Not specified"
    const goals = profileData.career_goals || "Not specified"

    const projectsText = projects.length > 0
      ? projects.map(p =>
          `- [${p.title || "Untitled"}] ${p.description || "(no description)"} (Category: ${p.category || "General"})`
        ).join("\n")
      : "No projects listed"

    const achievementsText = achievements.length > 0
      ? achievements.map(a =>
          `- [${a.title || "Untitled"}] ${a.description || "(no description)"} — from ${a.issuer || "Unknown"}`
        ).join("\n")
      : "No achievements listed"

    const ecsText = ecs.length > 0
      ? ecs.map(e =>
          `- [${e.title || "Untitled"}] Role: ${e.role || "Member"} at ${e.organization || "Unknown"} — ${e.description || "(no description)"}`
        ).join("\n")
      : "No extracurriculars listed"

    // 7. Build opportunity text
    const oppType = opp.type || "opportunity"
    const oppDescription = opp.description || "(no description)"
    const oppRequirements = opp.requirements || "(no requirements listed)"
    const oppLocation = opp.location_type || opp.location || "Not specified"
    const oppGradeLevels = opp.grade_levels
      ? (opp.grade_levels as number[]).map(g => `${g}th`).join(", ")
      : "All levels"
    const oppDeadline = opp.deadline || "Rolling"
    const matchScore = opp.match_score ?? 0

    // 8. Build the prompt
    const prompt = `You are an elite academic advisor for high school students who do serious research and competitive work. Your job is to generate ONE specific, non-obvious insight about how THIS student's actual background positions them for this opportunity.

STUDENT PROFILE:
School: ${school} | Location: ${location} | Grade: ${gradeLevel}
Interests: ${interests} | Skills: ${skills} | Academic Strengths: ${strengths}
Career Goals: ${goals}

STUDENT'S WORK (read carefully — depth matters):
Projects:
${projectsText}

Achievements:
${achievementsText}

Extracurriculars:
${ecsText}

OPPORTUNITY:
Title: ${opp.title} | Org: ${opp.company} | Type: ${oppType}
Description: ${oppDescription}
Requirements: ${oppRequirements}
Location: ${oppLocation} | Grade Levels Accepted: ${oppGradeLevels}
Deadline: ${oppDeadline} | Match Score: ${matchScore}%

EVALUATE:
1. Is this student doing substantive work? Look at: are their projects solving real problems? Are they working with researchers, mentors, or professionals? Are their achievements competitive wins (not just participation)? Do their extracurriculars show real depth?
2. Does any specific project, achievement, or background detail connect directly to what this opportunity values — in a way that isn't obvious from the match score?
3. Does the student's school, location, or enrollment status unlock eligibility they might not realize? (e.g. a community college = accredited state institution)
4. Is there a non-obvious way to position their specific work that would make them stand out in the application?

RULES:
- Reference actual project titles, achievement names, or school name — be specific
- For strong_match insights: you MUST name the specific themes, focus areas, or criteria the opportunity is evaluating AND explain exactly why the student's work connects. Example: "This competition judges solutions to food insecurity — your soil sensor project directly addresses that." Not: "Your project aligns with the themes."
- Do NOT generate an insight if the student's work is thin or generic
- Do NOT give generic advice like "be passionate" or "apply early"
- Do NOT repeat obvious match reasons
- This feature is for talent-showcase opportunities (research, competitions, programs) — not financial scholarships. If this opportunity is primarily financial aid, return null.
- If you cannot find something genuinely specific and non-obvious: respond with exactly null

Output ONLY valid JSON or the word null (no markdown, no explanation):
{"headline":"...","tip":"...","insight_type":"eligibility_boost|strategy_tip|strong_match|stretch_goal"}`

    // 9. Call AI
    let insight: InsightPayload | null = null
    try {
      const result = await googleAI.complete({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 300,
        temperature: 0.4,
      })

      const rawText = result.text?.trim() ?? ""

      if (rawText && rawText !== "null") {
        // Strip any accidental markdown fences
        const cleaned = rawText.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim()
        const parsed = JSON.parse(cleaned)
        if (parsed?.headline && parsed?.tip && parsed?.insight_type) {
          insight = {
            headline: String(parsed.headline).slice(0, 100),
            tip: String(parsed.tip).slice(0, 400),
            insight_type: parsed.insight_type,
          } as InsightPayload
        }
      }
    } catch (aiError) {
      console.error("[Insight] AI call failed:", aiError)
      // Return null insight gracefully — don't surface AI errors to user
    }

    // 10. Cache and return
    setCached(cacheKey, insight)

    return NextResponse.json(
      { insight, cached: false },
      {
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    )
  } catch (error: any) {
    console.error("[Insight] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
