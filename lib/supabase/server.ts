import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import type { Database } from "@/lib/database.types"
import { MOCK_USER, isDev } from "./dev-auth"
export { MOCK_USER, isDev }

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[supabase/server] Missing env vars — returning null-safe client')
    return createNullSafeClient()
  }

  try {
    const client = createServerClient<Database>(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components might not allow setting cookies.
          }
        },
      },
    })

    // Patch auth.getUser so it NEVER throws — @supabase/ssr@0.6.x throws
    // "Unauthorized" instead of returning an error object when the session
    // is missing or the API key is rejected. Every caller in the codebase
    // relies on the old return-value contract, so we restore it here.
    const originalGetUser = client.auth.getUser.bind(client.auth)
    client.auth.getUser = async (...args: Parameters<typeof originalGetUser>) => {
      try {
        return await originalGetUser(...args)
      } catch {
        return { data: { user: null }, error: null } as any
      }
    }

    return client
  } catch {
    console.warn('[supabase/server] createServerClient failed — returning null-safe client')
    return createNullSafeClient()
  }
}

/** Returns a minimal client stub so callers never crash even if Supabase is misconfigured. */
function createNullSafeClient() {
  const chain = () => {
    const obj: any = {
      select: chain,
      eq: chain,
      neq: chain,
      gt: chain,
      gte: chain,
      lt: chain,
      lte: chain,
      like: chain,
      ilike: chain,
      is: chain,
      in: chain,
      contains: chain,
      containedBy: chain,
      rangeGt: chain,
      rangeGte: chain,
      rangeLt: chain,
      rangeLte: chain,
      rangeAdjacent: chain,
      overlaps: chain,
      match: chain,
      not: chain,
      or: chain,
      filter: chain,
      order: chain,
      limit: chain,
      range: chain,
      abortSignal: chain,
      single: chain,
      maybeSingle: chain,
      csv: chain,
      url: chain,
      insert: chain,
      update: chain,
      upsert: chain,
      delete: chain,
      rpc: chain,
      then: (resolve: any) => resolve({ data: null, error: null, count: 0 }),
    }
    // Allow any other property access to also return the chain
    return new Proxy(obj, {
      get: (target, prop) => {
        if (prop in target) return target[prop]
        if (typeof prop === 'string') return chain
        return undefined
      }
    })
  }

  return {
    auth: {
      getUser: async () => ({ data: { user: isDev() ? MOCK_USER : null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => chain(),
    rpc: () => chain(),
  } as any
}

export async function getCurrentUser() {
  if (isDev()) return MOCK_USER

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
  } catch {
    return null
  }
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    const { redirect } = await import("next/navigation")
    redirect("/login")
  }
  return user
}
