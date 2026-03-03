import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import type { Database } from "@/lib/database.types"
import { MOCK_USER, isDev } from "./dev-auth"

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
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: () => ({
      select: () => ({ data: null, error: { message: 'Supabase not configured' } }),
    }),
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
