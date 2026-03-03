/**
 * Query Intent Parser for Precision Search
 *
 * Parses natural-language search queries into structured components:
 *   - domain: the subject area (e.g. "computer science", "biology")
 *   - type: the opportunity type mapped to DB enum (e.g. "volunteer", "internship")
 *   - modifiers: extra qualifiers (e.g. "summer", "remote", "paid")
 *
 * Zero LLM cost, instant execution (<1ms).
 */

export interface ParsedQuery {
  /** The subject/field keywords (e.g. ["computer science"]) */
  domain: string[]
  /** The opportunity type mapped to DB enum, or null if not specified */
  type: string | null
  /** The original type keyword the user typed (e.g. "volunteering") */
  originalTypeKeyword: string | null
  /** Extra qualifiers like "summer", "remote", "paid", "high school" */
  modifiers: string[]
  /** The raw input query */
  rawQuery: string
  /** Domain as a single phrase for matching (e.g. "computer science") */
  domainPhrase: string
}

// ──────────────────────────────────────────────
// TYPE keyword → DB enum mapping
// ──────────────────────────────────────────────

const TYPE_SYNONYMS: Record<string, string> = {
  // Direct matches to DB enum
  "internship": "internship",
  "internships": "internship",
  "intern": "internship",
  "interns": "internship",
  "research": "research",
  "competition": "competition",
  "competitions": "competition",
  "contest": "competition",
  "contests": "competition",
  "hackathon": "competition",
  "hackathons": "competition",
  "olympiad": "competition",
  "olympiads": "competition",
  "challenge": "competition",
  "challenges": "competition",
  "fellowship": "fellowship",
  "fellowships": "fellowship",
  "program": "program",
  "programs": "program",
  "camp": "program",
  "camps": "program",
  "academy": "program",
  "academies": "program",
  "bootcamp": "program",
  "bootcamps": "program",
  "course": "program",
  "courses": "program",
  "workshop": "program",
  "workshops": "program",
  "scholarship": "scholarship",
  "scholarships": "scholarship",
  "grant": "scholarship",
  "grants": "scholarship",
  "award": "scholarship",
  "awards": "scholarship",
  "volunteer": "volunteer",
  "volunteering": "volunteer",
  "volunteers": "volunteer",
  "community service": "volunteer",
  "service": "volunteer",
  "nonprofit": "volunteer",
  "non-profit": "volunteer",
}

// Multi-word type phrases (checked first, before single-word)
const MULTI_WORD_TYPE_PHRASES: [string, string][] = [
  ["community service", "volunteer"],
  ["summer program", "program"],
  ["summer programs", "program"],
  ["summer camp", "program"],
  ["summer camps", "program"],
  ["research program", "research"],
  ["research programs", "research"],
  ["research opportunity", "research"],
  ["research opportunities", "research"],
  ["science fair", "competition"],
  ["science fairs", "competition"],
  ["non-profit", "volunteer"],
  ["non profit", "volunteer"],
]

// ──────────────────────────────────────────────
// MODIFIER keywords (qualifiers, not domain or type)
// ──────────────────────────────────────────────

const MODIFIER_WORDS = new Set([
  "summer", "winter", "spring", "fall",
  "remote", "online", "virtual", "in-person", "hybrid",
  "paid", "unpaid", "free",
  "high school", "college", "undergraduate", "graduate",
  "local", "national", "international", "global",
  "2026", "2027",
  "for", "students", "teens", "youth", "high", "school",
])

// ──────────────────────────────────────────────
// KNOWN multi-word DOMAIN phrases
// We check these first to avoid splitting them
// ──────────────────────────────────────────────

const MULTI_WORD_DOMAINS = [
  "computer science",
  "data science",
  "machine learning",
  "artificial intelligence",
  "environmental science",
  "political science",
  "marine biology",
  "molecular biology",
  "civil engineering",
  "mechanical engineering",
  "electrical engineering",
  "chemical engineering",
  "biomedical engineering",
  "aerospace engineering",
  "software engineering",
  "computer engineering",
  "graphic design",
  "creative writing",
  "public speaking",
  "public health",
  "public policy",
  "social justice",
  "social media",
  "human rights",
  "climate change",
  "mental health",
  "film making",
  "game development",
  "web development",
  "app development",
  "mobile development",
  "cyber security",
  "foreign policy",
  "international relations",
  "community organizing",
  "animal welfare",
  "food science",
  "sports medicine",
  "physical therapy",
  "music production",
  "visual arts",
  "performing arts",
  "fine arts",
  "liberal arts",
]

// Stop words that are neither domain nor type
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "are", "be", "about",
  "find", "search", "looking", "want", "need", "help", "show", "get",
  "me", "my", "i", "best", "top", "good", "great", "near",
])

// ──────────────────────────────────────────────
// Levenshtein distance for fuzzy matching
// ──────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Fuzzy-match a word against all known TYPE_SYNONYMS.
 * Returns the DB type if a close match is found (edit distance ≤ 2 for words ≥ 5 chars,
 * edit distance ≤ 1 for shorter words), otherwise null.
 */
function fuzzyMatchType(word: string): { dbType: string; keyword: string } | null {
  if (word.length < 3) return null

  const maxDist = word.length >= 5 ? 2 : 1
  let bestMatch: { dbType: string; keyword: string; dist: number } | null = null

  for (const [synonym, dbType] of Object.entries(TYPE_SYNONYMS)) {
    // Skip multi-word synonyms for single-word fuzzy matching
    if (synonym.includes(" ")) continue
    const dist = levenshtein(word, synonym)
    if (dist <= maxDist && dist > 0) {
      if (!bestMatch || dist < bestMatch.dist) {
        bestMatch = { dbType, keyword: synonym, dist }
      }
    }
  }

  return bestMatch ? { dbType: bestMatch.dbType, keyword: bestMatch.keyword } : null
}

/**
 * Parse a search query into structured components.
 *
 * @example
 * parseSearchQuery("computer science volunteering")
 * // → { domain: ["computer science"], type: "volunteer", domainPhrase: "computer science", ... }
 *
 * parseSearchQuery("biology summer internship")
 * // → { domain: ["biology"], type: "internship", modifiers: ["summer"], ... }
 *
 * parseSearchQuery("robotics")
 * // → { domain: ["robotics"], type: null, domainPhrase: "robotics", ... }
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const rawQuery = query.trim()
  const lowerQuery = rawQuery.toLowerCase()

  let remaining = lowerQuery
  let detectedType: string | null = null
  let originalTypeKeyword: string | null = null
  const modifiers: string[] = []
  const domainParts: string[] = []

  // ── Step 1: Extract multi-word TYPE phrases ──
  for (const [phrase, dbType] of MULTI_WORD_TYPE_PHRASES) {
    if (remaining.includes(phrase)) {
      detectedType = dbType
      originalTypeKeyword = phrase
      remaining = remaining.replace(phrase, " ").trim()
      break
    }
  }

  // ── Step 2: Extract multi-word DOMAIN phrases ──
  const detectedDomains: string[] = []
  for (const domain of MULTI_WORD_DOMAINS) {
    if (remaining.includes(domain)) {
      detectedDomains.push(domain)
      remaining = remaining.replace(domain, " ").trim()
    }
  }

  // ── Step 3: Process remaining words ──
  const words = remaining
    .split(/\s+/)
    .filter(w => w.length >= 2)

  for (const word of words) {
    // Check if it's a type keyword (only if we haven't found one yet)
    if (!detectedType && TYPE_SYNONYMS[word]) {
      detectedType = TYPE_SYNONYMS[word]
      originalTypeKeyword = word
      continue
    }

    // Fuzzy match type keywords for misspellings (e.g., "voluntering" → "volunteer")
    if (!detectedType) {
      const fuzzyResult = fuzzyMatchType(word)
      if (fuzzyResult) {
        detectedType = fuzzyResult.dbType
        originalTypeKeyword = word
        console.log(`[QueryParser] Fuzzy matched "${word}" → "${fuzzyResult.keyword}" (type: ${fuzzyResult.dbType})`)
        continue
      }
    }

    // Check if it's a modifier
    if (MODIFIER_WORDS.has(word)) {
      modifiers.push(word)
      continue
    }

    // Check if it's a stop word
    if (STOP_WORDS.has(word)) {
      continue
    }

    // Everything else is domain
    domainParts.push(word)
  }

  // ── Step 4: Combine domain components ──
  const domain = [...detectedDomains, ...domainParts].filter(Boolean)

  // Build the domain phrase — multi-word domains stay together
  const domainPhrase = domain.join(" ").trim()

  return {
    domain,
    type: detectedType,
    originalTypeKeyword,
    modifiers,
    rawQuery,
    domainPhrase,
  }
}

/**
 * Get all synonyms/related terms for an opportunity type.
 * Used to search description text for type-related keywords.
 */
export function getTypeSearchTerms(dbType: string): string[] {
  const terms: string[] = [dbType]

  const reverseMap: Record<string, string[]> = {}
  for (const [synonym, type] of Object.entries(TYPE_SYNONYMS)) {
    if (!reverseMap[type]) reverseMap[type] = []
    reverseMap[type].push(synonym)
  }

  if (reverseMap[dbType]) {
    terms.push(...reverseMap[dbType])
  }

  return [...new Set(terms)]
}

/**
 * Check if a text contains the domain phrase or all domain words.
 * Returns a score:
 *   - 1.0: exact phrase match
 *   - 0.7: all domain words present (but not as phrase)
 *   - 0.4: most domain words present (>= 60%)
 *   - 0.0: no meaningful match
 */
export function scoreDomainMatch(text: string, parsed: ParsedQuery): number {
  if (!text || parsed.domain.length === 0) return 0

  const lowerText = text.toLowerCase()

  // Exact phrase match
  if (parsed.domainPhrase && lowerText.includes(parsed.domainPhrase)) {
    return 1.0
  }

  // All individual domain words present
  const allWords = parsed.domain.flatMap(d => d.split(/\s+/))
  const matchedWords = allWords.filter(w => lowerText.includes(w))

  if (matchedWords.length === allWords.length && allWords.length > 0) {
    return 0.7
  }

  // Partial match (>= 60% of words)
  if (allWords.length > 0 && matchedWords.length / allWords.length >= 0.6) {
    return 0.4
  }

  return 0
}

/**
 * Check if a text contains type-related keywords.
 * Returns true if any type synonym is found in the text.
 */
export function textMatchesType(text: string, dbType: string): boolean {
  if (!text || !dbType) return false

  const lowerText = text.toLowerCase()
  const typeTerms = getTypeSearchTerms(dbType)

  return typeTerms.some(term => lowerText.includes(term))
}

// ──────────────────────────────────────────────
// Known domain words for fuzzy domain correction
// ──────────────────────────────────────────────

const KNOWN_DOMAIN_WORDS = [
  // STEM
  "biology", "chemistry", "physics", "mathematics", "math", "science", "engineering",
  "computer", "technology", "robotics", "coding", "programming", "astronomy",
  "neuroscience", "genetics", "biochemistry", "ecology", "geology", "statistics",
  "calculus", "algebra", "geometry", "data", "cyber", "software", "hardware",
  "electronics", "nanotechnology", "biotechnology", "bioinformatics", "quantum",
  // Arts & Humanities
  "art", "arts", "music", "theater", "theatre", "drama", "dance", "film",
  "photography", "writing", "literature", "history", "philosophy", "language",
  "english", "spanish", "french", "chinese", "japanese", "latin", "linguistics",
  "poetry", "journalism", "animation", "design", "architecture",
  // Social Sciences
  "psychology", "sociology", "economics", "political", "government", "law",
  "anthropology", "geography", "education", "communication", "debate",
  // Business
  "business", "finance", "entrepreneurship", "marketing", "management",
  "accounting", "leadership", "consulting",
  // Health & Medicine
  "medicine", "medical", "health", "nursing", "pharmacy", "dentistry",
  "veterinary", "nutrition", "fitness", "sports", "athletic",
  // Other
  "environment", "environmental", "sustainability", "climate", "conservation",
  "agriculture", "culinary", "cooking", "fashion", "media", "social",
]

/**
 * Attempt to fix misspelled domain words using edit distance.
 * Returns the corrected query if any word was fixed, or null if nothing changed.
 */
export function fuzzyCorrectQuery(query: string): { corrected: string; wasChanged: boolean } {
  const words = query.toLowerCase().split(/\s+/)
  let changed = false
  const correctedWords: string[] = []

  for (const word of words) {
    // Skip short words, stop words, known type synonyms, and modifiers
    if (word.length < 4 || STOP_WORDS.has(word) || TYPE_SYNONYMS[word] || MODIFIER_WORDS.has(word)) {
      correctedWords.push(word)
      continue
    }

    // Check if it's already a known domain word
    if (KNOWN_DOMAIN_WORDS.includes(word)) {
      correctedWords.push(word)
      continue
    }

    // Try to fuzzy match against known domain words
    const maxDist = word.length >= 6 ? 2 : 1
    let bestMatch: { word: string; dist: number } | null = null

    for (const known of KNOWN_DOMAIN_WORDS) {
      // Quick length check — skip if lengths differ by more than maxDist
      if (Math.abs(word.length - known.length) > maxDist) continue
      const dist = levenshtein(word, known)
      if (dist > 0 && dist <= maxDist) {
        if (!bestMatch || dist < bestMatch.dist) {
          bestMatch = { word: known, dist }
        }
      }
    }

    if (bestMatch) {
      console.log(`[QueryParser] Fuzzy corrected domain word "${word}" → "${bestMatch.word}"`)
      correctedWords.push(bestMatch.word)
      changed = true
    } else {
      correctedWords.push(word)
    }
  }

  return {
    corrected: correctedWords.join(" "),
    wasChanged: changed,
  }
}
