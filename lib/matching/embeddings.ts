/**
 * STAR Engine — Embedding Operations
 *
 * Handles all vector embedding operations using Google's text-embedding-004 model.
 * Uses Float32Array for memory-efficient vector storage and optimized cosine similarity.
 *
 * Task types:
 *   - RETRIEVAL_QUERY: for student profiles (optimized for search queries)
 *   - RETRIEVAL_DOCUMENT: for opportunities (optimized for documents being searched)
 */

import { embed, embedMany } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"

// ─── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-004"
const EMBEDDING_DIMENSIONS = 768

export type EmbeddingTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"

// ─── Embedding Model Singleton ────────────────────────────────────────────────

let _embeddingModel: ReturnType<ReturnType<typeof createGoogleGenerativeAI>["textEmbeddingModel"]> | null = null

function getEmbeddingModel() {
  if (_embeddingModel) return _embeddingModel

  const useVertexAI = process.env.USE_VERTEX_AI === "true"

  if (useVertexAI) {
    const project = process.env.GOOGLE_VERTEX_PROJECT
    const location = process.env.GOOGLE_VERTEX_LOCATION || "us-central1"

    if (!project) {
      throw new Error("[Embeddings] GOOGLE_VERTEX_PROJECT required for Vertex AI embeddings")
    }

    // Check for JSON credentials (Vercel deployment)
    let credentials: { client_email: string; private_key: string } | undefined

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      try {
        const parsed = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        credentials = {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        }
      } catch {
        console.warn("[Embeddings] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON")
      }
    }

    let provider: ReturnType<typeof createVertex>
    if (credentials) {
      provider = createVertex({ project, location, googleAuthOptions: { credentials } })
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      provider = createVertex({
        project,
        location,
        googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS },
      })
    } else {
      provider = createVertex({ project, location })
    }
    _embeddingModel = provider.textEmbeddingModel(EMBEDDING_MODEL) as any
  } else {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error("[Embeddings] GOOGLE_GENERATIVE_AI_API_KEY required for embeddings")
    }
    const provider = createGoogleGenerativeAI({ apiKey })
    _embeddingModel = provider.textEmbeddingModel(EMBEDDING_MODEL)
  }

  return _embeddingModel!
}

// ─── Core Embedding Functions ─────────────────────────────────────────────────

/**
 * Embed a single text string into a 768-dimensional Float32Array.
 */
export async function embedText(
  text: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<Float32Array> {
  const model = getEmbeddingModel()

  const result = await embed({
    model,
    value: text.slice(0, 10000), // Cap at 10k chars for safety
    providerOptions: {
      google: { taskType },
    },
  })

  return new Float32Array(result.embedding)
}

/**
 * Embed multiple texts in a single batched API call.
 * Returns Float32Array[] — one vector per input text.
 * Max 100 texts per call (Gemini API limit).
 */
export async function embedBatch(
  texts: string[],
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<Float32Array[]> {
  if (texts.length === 0) return []

  const model = getEmbeddingModel()

  // Cap each text and batch size
  const capped = texts.map((t) => t.slice(0, 10000))

  const result = await embedMany({
    model,
    values: capped,
    providerOptions: {
      google: { taskType },
    },
  })

  return result.embeddings.map((e) => new Float32Array(e))
}

// ─── Vector Math ──────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB)
  if (magnitude === 0) return 0

  return dot / magnitude
}

/**
 * Subtract vector b from vector a: result = a - b.
 * Used for computing Growth Vectors (V_current - V_baseline).
 */
export function vectorSubtract(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] - b[i]
  }
  return result
}

/**
 * Average multiple vectors into a single centroid.
 */
export function vectorAverage(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) return new Float32Array(EMBEDDING_DIMENSIONS)
  if (vectors.length === 1) return vectors[0]

  const result = new Float32Array(EMBEDDING_DIMENSIONS)
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) {
      result[i] += v[i]
    }
  }
  for (let i = 0; i < result.length; i++) {
    result[i] /= vectors.length
  }
  return result
}

/**
 * Convert a number[] from the database to a Float32Array.
 */
export function vectorFromArray(arr: number[]): Float32Array {
  return new Float32Array(arr)
}

// ─── Text Builders ────────────────────────────────────────────────────────────

interface StudentProfile {
  interests?: string[] | null
  skills?: string[] | null
  career_goals?: string | null
  academic_strengths?: string[] | null
}

interface ExtracurricularActivity {
  title: string
  organization?: string | null
  type?: string | null
  description?: string | null
}

/**
 * Build a rich text representation of a student for embedding.
 * Uses RETRIEVAL_QUERY task type for asymmetric search.
 */
export function buildStudentEmbeddingText(
  profile: StudentProfile,
  extracurriculars?: ExtracurricularActivity[]
): string {
  const parts: string[] = []

  if (profile.interests && profile.interests.length > 0) {
    parts.push(`Interests: ${profile.interests.join(", ")}.`)
  }

  if (profile.skills && profile.skills.length > 0) {
    parts.push(`Skills: ${profile.skills.join(", ")}.`)
  }

  if (profile.career_goals && profile.career_goals.trim()) {
    parts.push(`Goals: ${profile.career_goals.trim()}.`)
  }

  if (profile.academic_strengths && profile.academic_strengths.length > 0) {
    parts.push(`Strengths: ${profile.academic_strengths.join(", ")}.`)
  }

  if (extracurriculars && extracurriculars.length > 0) {
    const ecTexts = extracurriculars
      .slice(0, 10)
      .map((ec) => {
        const org = ec.organization ? ` at ${ec.organization}` : ""
        return `${ec.title}${org}`
      })
      .join(", ")
    parts.push(`Activities: ${ecTexts}.`)
  }

  return parts.join(" ") || "High school student exploring opportunities."
}

/**
 * Build a text representation of an opportunity for embedding.
 * Uses RETRIEVAL_DOCUMENT task type for asymmetric search.
 */
export function buildOpportunityEmbeddingText(opp: {
  title?: string | null
  description?: string | null
  category?: string | null
  type?: string | null
  skills?: string[] | null
  company?: string | null
}): string {
  const parts: string[] = []

  if (opp.title) {
    parts.push(`Title: ${opp.title}.`)
  }

  if (opp.category) {
    parts.push(`Category: ${opp.category}.`)
  }

  if (opp.type) {
    parts.push(`Type: ${opp.type}.`)
  }

  if (opp.company) {
    parts.push(`Organization: ${opp.company}.`)
  }

  if (opp.skills && opp.skills.length > 0) {
    parts.push(`Skills: ${opp.skills.join(", ")}.`)
  }

  if (opp.description) {
    // Cap description to first 500 chars for embedding
    const desc = opp.description.slice(0, 500)
    parts.push(`Description: ${desc}`)
  }

  return parts.join(" ") || "Opportunity for high school students."
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { EMBEDDING_DIMENSIONS }
