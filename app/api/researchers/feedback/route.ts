import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/supabase/server"
import { submitFeedback } from "@/app/actions/researchers"

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { profileName, topic, vote, reason } = body

    if (!profileName || !vote) {
      return NextResponse.json({ error: "Missing profileName or vote" }, { status: 400 })
    }

    if (!["up", "down", "skip", "report"].includes(vote)) {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 })
    }

    await submitFeedback(profileName, topic || "", vote, reason)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("[Feedback] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
