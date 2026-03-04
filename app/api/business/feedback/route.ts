import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, createClient } from "@/lib/supabase/server"
import { googleAI } from "@/lib/ai/google-model-manager"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 30

// ── Feedback shape ────────────────────────────────────────────────────────────

export interface FeedbackDimension {
  score: number
  label: string
  explanation: string
}

export interface StartupFeedback {
  overall_score: number
  summary: string
  dimensions: {
    market_opportunity: FeedbackDimension
    product_clarity: FeedbackDimension
    team_execution: FeedbackDimension
    traction_signals: FeedbackDimension
    investor_readiness: FeedbackDimension
  }
  strengths: string[]
  critical_gaps: string[]
  next_milestone: string
  investor_fit: string[]
  pitch_improvements: string[]
}

// ── In-memory cache: `${userId}:${projectId}` → { feedback, expires }
const cache = new Map<string, { feedback: StartupFeedback; expires: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

// ── Prompt ─────────────────────────────────────────────────────────────────────

const FEEDBACK_PROMPT = `You are a Partner-level VC doing first-pass due diligence on a student-founded startup. Be direct, honest, and specific. Avoid generic platitudes.

STARTUP PROFILE:
Name: {title}
Description: {description}
Stage/Status: {status}
Progress: {progress}%
Tags/Industry: {tags}
Team size: {teamSize} ({collaborators})
Links: {links}

FOUNDER CONTEXT:
{founderContext}

Evaluate this startup across 5 dimensions and return a JSON object with this exact shape:
{
  "overall_score": <integer 0-100>,
  "summary": "<2-3 sentence executive summary of this startup's investment potential — be direct>",
  "dimensions": {
    "market_opportunity": {
      "score": <integer 0-100>,
      "label": "<Exceptional|Strong|Moderate|Weak|Unclear>",
      "explanation": "<1-2 specific sentences about market size, timing, and competitive dynamics>"
    },
    "product_clarity": {
      "score": <integer 0-100>,
      "label": "<Exceptional|Strong|Moderate|Weak|Unclear>",
      "explanation": "<1-2 sentences about how clearly the product/solution is defined>"
    },
    "team_execution": {
      "score": <integer 0-100>,
      "label": "<Exceptional|Strong|Moderate|Weak|Unclear>",
      "explanation": "<1-2 sentences about team composition, skills, and founder-market fit>"
    },
    "traction_signals": {
      "score": <integer 0-100>,
      "label": "<Exceptional|Strong|Moderate|Weak|None>",
      "explanation": "<1-2 sentences about evidence of traction, users, revenue, or validation>"
    },
    "investor_readiness": {
      "score": <integer 0-100>,
      "label": "<Exceptional|Strong|Moderate|Weak|Not Ready>",
      "explanation": "<1-2 sentences about how ready this startup is to fundraise>"
    }
  },
  "strengths": ["<specific strength 1>", "<specific strength 2>"],
  "critical_gaps": ["<critical gap investors would flag 1>", "<critical gap 2>"],
  "next_milestone": "<single most impactful next step to increase fundability>",
  "investor_fit": ["<investor type 1 — e.g. 'Pre-seed angel focused on EdTech'>", "<investor type 2>"],
  "pitch_improvements": ["<specific improvement to pitch or description 1>", "<improvement 2>"]
}

Rules:
- Be honest and specific — generic advice is useless
- overall_score should reflect TRUE investor appeal, not encouragement
- A student startup with no traction and no team scores 20-35, not 70
- Only return valid JSON, no markdown`

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rateLimitKey = createRateLimitKey("SUMMARIZE", `business-feedback:${user.id}`)
    const { success: withinLimit } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.SUMMARIZE.limit,
      RATE_LIMITS.SUMMARIZE.windowSeconds
    )
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { projectId, refresh } = body

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    const cacheKey = `${user.id}:${projectId}`

    // Cache hit
    if (!refresh) {
      const cached = cache.get(cacheKey)
      if (cached && cached.expires > Date.now()) {
        return NextResponse.json({ feedback: cached.feedback, cached: true })
      }
    }

    // Fetch project
    const supabase = await createClient()
    const { data, error } = await (supabase.from("projects") as any)
      .select(
        `
        *,
        project_collaborators(role, users(name))
      `
      )
      .eq("id", projectId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (data.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch founder profile
    const [userResult, profileResult] = await Promise.all([
      (supabase.from("users") as any)
        .select("name, skills, interests")
        .eq("id", user.id)
        .single(),
      (supabase.from("user_profiles") as any)
        .select("grade_level")
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

    const userData = userResult.data || {}
    const profileData = profileResult.data || {}

    const founderName = (userData.name as string) || "Founder"
    const grade = profileData.grade_level ? `${profileData.grade_level}th grade student` : "high school student"
    const skills = ((userData.skills as string[]) || []).join(", ") || "not listed"
    const interests = ((userData.interests as string[]) || []).join(", ") || "not listed"

    // Build prompt context
    const collaborators = (data.project_collaborators || [])
      .map((c: any) => `${c.users?.name || "Member"} (${c.role})`)
      .join(", ") || "solo founder"

    const links = (data.links || [])
      .map((l: any) => `${l.type}: ${l.url}`)
      .join(", ") || "none"

    const founderContext = `Founder: ${founderName}, ${grade}. Skills: ${skills}. Interests: ${interests}.`

    const prompt = FEEDBACK_PROMPT
      .replace("{title}", data.title)
      .replace("{description}", data.description || "(no description)")
      .replace("{status}", data.status || "unknown")
      .replace("{progress}", String(data.progress || 0))
      .replace("{tags}", (data.tags || []).join(", ") || "none")
      .replace("{teamSize}", String((data.project_collaborators || []).length + 1))
      .replace("{collaborators}", collaborators)
      .replace("{links}", links)
      .replace("{founderContext}", founderContext)

    if (!googleAI) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 })
    }

    const result = await googleAI.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      temperature: 0.2,
    })

    const rawText = result.text?.trim() ?? ""
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const feedback: StartupFeedback = JSON.parse(cleaned)

    // Basic validation
    if (typeof feedback.overall_score !== "number" || !feedback.dimensions) {
      throw new Error("Invalid feedback structure")
    }

    // Evict stale cache entries
    if (cache.size > 500) {
      const now = Date.now()
      for (const [key, val] of cache.entries()) {
        if (val.expires < now) cache.delete(key)
      }
    }

    cache.set(cacheKey, { feedback, expires: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ feedback, cached: false })
  } catch (error: any) {
    console.error("[BusinessFeedback] Error:", error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }
    return NextResponse.json({ error: "Failed to generate feedback" }, { status: 500 })
  }
}
