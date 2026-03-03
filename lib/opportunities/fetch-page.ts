/**
 * Fetch a web page and extract clean text content.
 * Zero-dependency HTML-to-text (regex-based, no cheerio).
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "-",
  "&mdash;": "--",
  "&bull;": "-",
  "&hellip;": "...",
  "&copy;": "(c)",
  "&reg;": "(R)",
  "&trade;": "(TM)",
}

function decodeEntities(text: string): string {
  let decoded = text
  for (const [entity, replacement] of Object.entries(ENTITIES)) {
    decoded = decoded.replaceAll(entity, replacement)
  }
  // Numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code))
  )
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  )
  return decoded
}

function htmlToText(html: string): string {
  let text = html

  // Remove entire blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "")
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "")
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "")
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "")
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "")

  // Convert block elements to newlines
  text = text.replace(/<\/?(h[1-6]|p|div|section|article|li|tr|br|hr)\b[^>]*>/gi, "\n")

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, " ")

  // Decode HTML entities
  text = decodeEntities(text)

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, " ")
  text = text.replace(/\n\s*\n/g, "\n\n")
  text = text.trim()

  return text
}

function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const importantKeywords = [
    "deadline",
    "apply",
    "application",
    "eligibility",
    "requirements",
    "program",
    "dates",
    "registration",
    "submit",
    "enroll",
    "cost",
    "fee",
    "free",
    "scholarship",
    "grade",
  ]

  const lines = text.split("\n")
  const headChars = 6000
  const tailChars = 3000

  const head = text.slice(0, headChars)
  const tail = text.slice(-tailChars)

  // Find important lines from the middle
  const middleStart = headChars
  const middleEnd = text.length - tailChars
  const importantLines: string[] = []

  let charCount = 0
  for (const line of lines) {
    charCount += line.length + 1
    if (charCount < middleStart || charCount > middleEnd) continue
    const lower = line.toLowerCase()
    if (importantKeywords.some((kw) => lower.includes(kw))) {
      importantLines.push(line.trim())
    }
  }

  const middle = importantLines.join("\n").slice(0, maxLength - headChars - tailChars)
  const result = `${head}\n\n[...]\n\n${middle}\n\n[...]\n\n${tail}`
  return result.slice(0, maxLength)
}

export type FetchResult =
  | { content: string; finalUrl: string; error?: undefined }
  | { error: string; content?: undefined; finalUrl?: undefined }

export async function fetchPageContent(
  url: string,
  options?: { timeout?: number; maxLength?: number }
): Promise<FetchResult> {
  const timeout = options?.timeout ?? 10000
  const maxLength = options?.maxLength ?? 15000

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })

    clearTimeout(timer)

    if (!response.ok) {
      return { error: `HTTP ${response.status} ${response.statusText}` }
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      return { error: `Unsupported content type: ${contentType}` }
    }

    const html = await response.text()
    const text = htmlToText(html)

    if (text.length < 50) {
      return { error: "Page content too short (likely blocked or empty)" }
    }

    const truncated = smartTruncate(text, maxLength)

    return {
      content: truncated,
      finalUrl: response.url || url,
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { error: `Timeout after ${timeout}ms` }
    }
    return { error: err.message || "Failed to fetch page" }
  }
}
