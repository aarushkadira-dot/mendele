/**
 * Gemini AI extraction: page text -> structured opportunity data.
 * Ported from ec-scraper/src/agents/extractor.py
 */

import { googleAI } from "@/lib/ai"

export interface ExtractedOpportunity {
  title: string
  organization: string
  description: string
  url: string | null
  category: string
  type: string
  location: string | null
  location_type: "In-Person" | "Online" | "Hybrid"
  grade_levels: number[]
  deadline: string | null
  start_date: string | null
  end_date: string | null
  cost: string | null
  skills: string[]
  timing_type: string
  extraction_confidence: number
}

export interface ExtractionResult {
  isListPage: boolean
  opportunities: ExtractedOpportunity[]
}

function getCurrentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

const SINGLE_EXTRACTION_SYSTEM = `You are an expert at extracting information about opportunities for high school students.

Current date: ${getCurrentDate()}

Given webpage content, extract structured information about the opportunity.

VALIDATION:
- Set valid=false if: ranking article listing MULTIPLE programs, directory page, forum, guide/advice article, news/blog, graduate-only, 404 page
- Set valid=true if: specific program page, university outreach, scholarship application, competition homepage, club/organization page

EXTRACTION INSTRUCTIONS:
1. Classify content_type: "opportunity", "guide", or "list_page"
2. If list_page: set is_list_page=true and extract up to 10 distinct opportunities
3. If opportunity: extract the MAIN opportunity only
4. DATE EXTRACTION - search extensively for: application deadline, program dates, start/end dates
   - Formats: "Apply by March 15, 2026", "Deadline: 3/15/26", "June 1 - August 15, 2026"
   - If dates are in the PAST (2025 or earlier), set appears_expired=true
5. TIMING: one-time, annual, recurring, rolling, ongoing, or seasonal
6. For grade_levels: infer from "High School"/"9th-12th grade" -> [9,10,11,12]
7. Confidence: 0.9+ (full details), 0.7-0.8 (good), 0.5-0.6 (basic), <0.5 (incomplete)

Return ONLY valid JSON (no markdown code fences):
{
  "valid": true/false,
  "content_type": "opportunity" | "guide" | "list_page",
  "is_list_page": false,
  "opportunities": [{
    "title": "Program Name",
    "organization": "Organization",
    "description": "1-2 sentence summary",
    "url": "https://... or null",
    "category": "STEM|Arts|Business|Humanities|Social_Sciences|Health|Community_Service|Other",
    "type": "Competition|Internship|Research|Summer Program|Club|Scholarship|Volunteer|Camp|Workshop|Course|Other",
    "location": "City, State or null",
    "location_type": "In-Person|Online|Hybrid",
    "grade_levels": [9,10,11,12],
    "deadline": "YYYY-MM-DD or null",
    "start_date": "YYYY-MM-DD or null",
    "end_date": "YYYY-MM-DD or null",
    "cost": "Free|$amount or null",
    "skills": ["skill1", "skill2"],
    "timing_type": "annual|one-time|rolling|ongoing|seasonal|recurring",
    "confidence": 0.8,
    "appears_expired": false
  }]
}`

const LIST_EXTRACTION_SYSTEM = `You are an expert at extracting information about HIGH SCHOOL opportunities from list/directory pages.

Current date: ${getCurrentDate()}

This page lists MULTIPLE opportunities. Extract up to 10 distinct, high-quality opportunities suitable for high school students.

SELECTION CRITERIA:
- Focus on opportunities with SPECIFIC program names and organizations
- Prioritize those with deadlines, application info, or official program details
- Skip generic advice or vague mentions
- Ensure each is DISTINCT (different program, not variations)

Return ONLY valid JSON (no markdown code fences):
{
  "is_list_page": true,
  "opportunities": [{
    "title": "Specific Program Name",
    "organization": "Hosting Organization",
    "description": "1-2 sentence description",
    "url": "Direct link if available, otherwise null",
    "category": "STEM|Arts|Business|Humanities|Social_Sciences|Health|Community_Service|Other",
    "type": "Competition|Internship|Research|Summer Program|Club|Scholarship|Volunteer|Camp|Workshop|Course|Other",
    "location": "City, State or null",
    "location_type": "In-Person|Online|Hybrid",
    "grade_levels": [9,10,11,12],
    "deadline": "YYYY-MM-DD or null",
    "start_date": "YYYY-MM-DD or null",
    "end_date": "YYYY-MM-DD or null",
    "cost": "Free|$amount or null",
    "skills": ["skill1", "skill2"],
    "timing_type": "annual|one-time|rolling|ongoing|seasonal|recurring",
    "confidence": 0.7
  }]
}

If this is NOT actually a list page, return:
{ "is_list_page": false, "opportunities": [] }`

/** Heuristic: does this content look like a list/aggregator page? */
export function isLikelyListPage(content: string): boolean {
  const lower = content.toLowerCase()
  let signals = 0

  // Check for listing phrases
  if (/\btop\s+\d+/i.test(content)) signals++
  if (/\bbest\s+\d+/i.test(content)) signals++
  if (/programs?\s+for\s+(high\s+school|students)/i.test(content)) signals++
  if (/internships?\s+for\s+(high\s+school|students|teens)/i.test(content)) signals++
  if (/scholarships?\s+for/i.test(content)) signals++

  // Numbered lists (e.g., "1. MIT Program", "2. Stanford Lab")
  const numberedItems = (content.match(/^\d+\.\s+[A-Z]/gm) || []).length
  if (numberedItems >= 5) signals++

  // Many bullet points or list items
  const bulletItems = (content.match(/^[\-\*\u2022]\s+/gm) || []).length
  if (bulletItems >= 5) signals++

  // High frequency of organization mentions suggests a directory
  const orgKeywords = ["university", "institute", "foundation", "academy", "program", "school"]
  const orgCount = orgKeywords.reduce(
    (count, kw) => count + (lower.split(kw).length - 1),
    0
  )
  if (orgCount >= 8) signals++

  return signals >= 2
}

function extractTextFromResult(result: any): string {
  if (typeof result.content === "string") return result.content
  if (Array.isArray(result.content)) {
    return result.content
      .map((p: any) => (typeof p === "string" ? p : p.text ?? ""))
      .join("")
  }
  if (typeof result.text === "string") return result.text
  return String(result.content || result.text || "")
}

function parseJsonResponse(raw: string): any {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim()
  return JSON.parse(cleaned)
}

function normalizeOpportunity(raw: any, sourceUrl: string): ExtractedOpportunity {
  return {
    title: raw.title || "Unknown",
    organization: raw.organization || "Unknown",
    description: raw.description || raw.summary || "",
    url: raw.url || null,
    category: raw.category || "Other",
    type: raw.type || raw.opportunity_type || "Other",
    location: raw.location || null,
    location_type: raw.location_type || "Online",
    grade_levels:
      raw.grade_levels && Array.isArray(raw.grade_levels) && raw.grade_levels.length > 0
        ? raw.grade_levels
        : [9, 10, 11, 12],
    deadline: raw.deadline || null,
    start_date: raw.start_date || null,
    end_date: raw.end_date || null,
    cost: raw.cost || null,
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    timing_type: raw.timing_type || "annual",
    extraction_confidence: raw.confidence || raw.extraction_confidence || 0.6,
  }
}

/** Extract opportunities from page content using Gemini AI. */
export async function extractOpportunities(
  content: string,
  url: string
): Promise<ExtractionResult> {
  const likelyList = isLikelyListPage(content)

  try {
    const systemPrompt = likelyList ? LIST_EXTRACTION_SYSTEM : SINGLE_EXTRACTION_SYSTEM
    const userPrompt = `URL: ${url}\n\nWEBPAGE CONTENT:\n---\n${content}\n---`

    const result = await googleAI.complete({
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
      temperature: 0.2,
      maxTokens: 4000,
    })

    const rawText = extractTextFromResult(result)
    const parsed = parseJsonResponse(rawText)

    // Handle list page response
    if (parsed.is_list_page && Array.isArray(parsed.opportunities)) {
      const opportunities = parsed.opportunities
        .filter((o: any) => o.title && o.title !== "Unknown")
        .map((o: any) => normalizeOpportunity(o, url))

      return { isListPage: true, opportunities }
    }

    // Handle single opportunity response
    if (parsed.valid === false) {
      // AI says this isn't a valid opportunity page — but might be a list
      // Try list extraction as fallback
      if (!likelyList && parsed.content_type === "list_page") {
        return extractOpportunities(content, url) // Retry won't loop because likelyList will be checked differently
      }
      return { isListPage: false, opportunities: [] }
    }

    // Single valid opportunity
    if (Array.isArray(parsed.opportunities) && parsed.opportunities.length > 0) {
      const opportunities = parsed.opportunities
        .filter((o: any) => o.title && o.title !== "Unknown")
        .map((o: any) => normalizeOpportunity(o, url))

      return {
        isListPage: parsed.is_list_page || opportunities.length > 1,
        opportunities,
      }
    }

    // Direct opportunity object (not wrapped in array)
    if (parsed.title) {
      return {
        isListPage: false,
        opportunities: [normalizeOpportunity(parsed, url)],
      }
    }

    return { isListPage: false, opportunities: [] }
  } catch (error) {
    console.error("[AI Extract] Failed to extract opportunities:", error)
    return { isListPage: false, opportunities: [] }
  }
}
