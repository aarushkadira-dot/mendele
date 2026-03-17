import { NextRequest, NextResponse } from 'next/server'
import { googleAI, type Message } from '@/lib/ai/google-model-manager'
import { TOOLS, type ToolResult } from '@/lib/ai/tools'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const SYSTEM_PROMPT = `You are Networkly AI — a deeply personalized career and opportunity advisor for students and young professionals.

════════════════════════════════════════
STEP 1 — ALWAYS DO THIS FIRST
════════════════════════════════════════
Before answering ANY question involving advice, recommendations, skills, opportunities, or goals:
1. Call get_user_profile
2. Call get_extracurriculars

Read the results carefully. Everything you say must flow directly from what you find there.

════════════════════════════════════════
STEP 2 — REASON FROM THEIR PROFILE
════════════════════════════════════════
Mentally work through this chain every time:
  "User wants [X] → Their profile shows [skills/interests/grade] → Therefore the SPECIFIC best fit is [named resource/program/opportunity]"

Examples of the reasoning quality you must match:
- User wants to learn skills + profile shows coding interest → "Harvard CS50P (Python) on edX is free, self-paced, and gives a certificate. Given you're into coding, start with Week 1 today."
- User wants research experience + profile shows biology interest → "Cold-email Prof. Jane Smith at UNC's Genome Sciences lab — high schoolers with bio interest often get shadowing spots in summer."
- User is 10th grade + interested in entrepreneurship → "DECA or FBLA at your school, plus the Diamond Challenge startup competition for high schoolers — $50K prize, no experience needed."
- User has no extracurriculars yet + interested in writing → "Start with your school newspaper or create a Substack. Colleges love self-initiated projects."

════════════════════════════════════════
STEP 3 — BE HYPER-SPECIFIC
════════════════════════════════════════
Never give generic advice. Always name:
- The exact course/program/competition (e.g., "MIT OpenCourseWare 6.0001", not just "online courses")
- The exact organization (e.g., "Khan Academy's AP CS A track", not "coding websites")
- The exact action (e.g., "Apply by March 1 at hsa.mit.edu", not "look into MIT programs")

Resource knowledge by interest area:
• Coding/CS: Harvard CS50 (free, edX), MIT 6.0001 OCW, freeCodeCamp, Replit 100 Days of Code, Google Summer of Code, USACO, Congressional App Challenge
• Biology/Medicine: NIH Summer Internship Program, Research Science Institute (RSI), Siemens Competition, JSHS, local hospital volunteer programs, PubMed paper reading
• Math: MATHCOUNTS, AMC 8/10/12, AIME, Art of Problem Solving (AoPS), MIT PRIMES program
• Business/Entrepreneurship: DECA, FBLA, Diamond Challenge, Young Entrepreneurs Academy, Wharton Global Youth Program
• Writing/Journalism: Scholastic Art & Writing Awards, National YoungArts Foundation, school newspaper, personal Substack
• Engineering/Robotics: FIRST Robotics (FRC/FTC), VEX, Science Olympiad, TSA
• Social Impact: Ashoka Youth Venture, DoSomething.org, Congressional Award, local nonprofit volunteering
• Design/Art: Adobe Creative Residency, Pratt Institute pre-college, Behance portfolio building

════════════════════════════════════════
STEP 4 — OPPORTUNITY SEARCH PROTOCOL
════════════════════════════════════════
When finding opportunities:
1. ALWAYS call smart_search_opportunities first with a tight 1-2 word query matching their interests
2. If 0 results → tell user, then ask if they want a web search
3. Use filter_by_deadline only for deadline-specific requests
4. Embed top results with {{card:OPPORTUNITY_ID}}

════════════════════════════════════════
PERSONALITY
════════════════════════════════════════
- Speak like a brilliant older friend, not a corporate chatbot
- Be direct and specific — no fluff, no vague encouragement
- Show you actually read their profile ("Since you're into X and already did Y...")
- One concrete next step at the end of every response

Never mention tool names, databases, or internal processes to the user.
`

interface UIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  name?: string
}

interface ChatRequest {
  messages: UIMessage[]
  stream?: boolean
  confirmBookmark?: { opportunityId: string; opportunityTitle: string }
  confirmWebDiscovery?: { query: string }
}

import { getCurrentUser } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const body = await req.json() as ChatRequest
    const { messages, stream: shouldStream = true, confirmBookmark, confirmWebDiscovery } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 })
    }

    if (confirmBookmark) {
      const bookmarkTool = TOOLS.bookmark_opportunity
      if (!bookmarkTool.execute) {
        return NextResponse.json({ type: 'bookmark_result', success: false, message: 'Bookmark not available' })
      }
      const bookmarkResult = await bookmarkTool.execute(
        { opportunityId: confirmBookmark.opportunityId, opportunityTitle: confirmBookmark.opportunityTitle },
        { experimental_context: { userId: user.id } } as never
      )
      const typedResult = bookmarkResult as ToolResult
      return NextResponse.json({
        type: 'bookmark_result',
        success: typedResult.success,
        message: typedResult.success ? `Saved "${confirmBookmark.opportunityTitle}"!` : 'Failed to save.'
      })
    }

    if (confirmWebDiscovery) {
      return NextResponse.json({ type: 'trigger_discovery', query: confirmWebDiscovery.query })
    }

    const aiMessages = createMessages(messages)

    if (shouldStream) {
      return handleStreaming(aiMessages, user.id, supabase)
    }

    return NextResponse.json({ error: 'Standard mode not implemented' })

  } catch (error) {
    console.error('[Chat API Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function createMessages(uiMessages: UIMessage[]): Message[] {
  return uiMessages.map(msg => ({
    role: msg.role,
    content: msg.content,
    toolCallId: msg.toolCallId,
    name: msg.name,
  }))
}

async function handleStreaming(messages: Message[], userId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

    ; (async () => {
      try {
        await processStreamLoop(messages, userId, supabase, writer, encoder)
        await writer.write(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        console.error('Stream processing error:', e)
        const err = e instanceof Error ? e.message : String(e)
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err })}\n\n`))
      } finally {
        await writer.close()
      }
    })()

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

async function processStreamLoop(
  messages: Message[],
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  recursionDepth = 0
) {
  if (recursionDepth > 5) throw new Error('Max recursion depth reached')

  const result = await googleAI.stream({
    messages,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    experimental_context: { userId, supabaseClient: supabase },
  })

  let fullContent = ''
  const toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = []
  const toolResults: Array<{ toolCallId: string; toolName: string; output: unknown }> = []

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      const text = chunk.text || ''
      fullContent += text
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'text-delta',
        textDelta: text
      })}\n\n`))
    }

    if (chunk.type === 'tool-call') {
      const input = 'input' in chunk ? chunk.input : ('args' in chunk ? (chunk as unknown as { args: unknown }).args : {})
      toolCalls.push({
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        args: input,
      })

      const statusMsg = getLoadingMessage([chunk.toolName])
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'tool-status',
        status: statusMsg
      })}\n\n`))
    }

    if (chunk.type === 'tool-result') {
      toolResults.push({
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        output: chunk.output,
      })

      await handleSpecialToolTriggers(chunk.toolName, chunk.output, writer, encoder)
    }
  }

  if (toolCalls.length > 0) {
    messages.push({
      role: 'assistant',
      content: fullContent || '',
      toolCalls: toolCalls.map(tc => ({
        id: tc.toolCallId,
        function: {
          name: tc.toolName,
          arguments: JSON.stringify(tc.args)
        }
      }))
    })

    for (const tr of toolResults) {
      messages.push({
        role: 'tool',
        content: JSON.stringify(tr.output),
        toolCallId: tr.toolCallId,
        name: tr.toolName,
      })
    }

    await processStreamLoop(messages, userId, supabase, writer, encoder, recursionDepth + 1)
  }
}

async function handleSpecialToolTriggers(
  toolName: string,
  output: unknown,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder
) {
  const result = output as ToolResult
  if (!result?.success || !result?.data) return

  const data = result.data as Record<string, unknown>

  if (toolName.includes('web_discovery') && data.triggerDiscovery) {
    await writer.write(encoder.encode(`data: ${JSON.stringify({
      type: 'trigger_discovery',
      query: data.query,
      isPersonalized: data.isPersonalized || false,
    })}\n\n`))
  }

  if (toolName.includes('search_opportunities') || toolName === 'filter_by_deadline') {
    const opportunities = data.opportunities as unknown[] | undefined
    if (opportunities && opportunities.length > 0) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'opportunities',
        opportunities: opportunities,
        isPersonalized: toolName === 'smart_search_opportunities',
      })}\n\n`))
    }
  }
}

function getLoadingMessage(toolNames: string[]): string {
  const messages: Record<string, string> = {
    'get_user_profile': 'Looking at your profile...',
    'get_extracurriculars': 'Checking your activities...',
    'get_saved_opportunities': 'Looking at your bookmarks...',
    'search_opportunities': 'Looking for opportunities...',
    'smart_search_opportunities': 'Finding personalized opportunities for you...',
    'filter_by_deadline': 'Checking upcoming deadlines...',
    'trigger_web_discovery': 'Looking across the web...',
    'personalized_web_discovery': 'Searching the web based on your interests...',
  }
  for (const name of toolNames) {
    if (messages[name]) return messages[name]
  }
  return 'Thinking...'
}
