import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

type CookieToSet = { name: string; value: string; options?: CookieOptions }

import { MOCK_USER, isDev } from "./dev-auth"

export async function updateSession(request: NextRequest) {
  if (isDev()) {
    return { supabaseResponse: NextResponse.next({ request }), user: MOCK_USER }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  const supabaseResponse = NextResponse.next({ request })

  if (!supabaseUrl || !supabaseKey) {
    return { supabaseResponse, user: null }
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) => {
              supabaseResponse.cookies.set(name, value, options)
            })
          } catch {
            // ignore
          }
        },
      },
    })

    // Patch getUser so it never throws — @supabase/ssr@0.6.x throws on 401
    const originalGetUser = supabase.auth.getUser.bind(supabase.auth)
    supabase.auth.getUser = async (...args: Parameters<typeof originalGetUser>) => {
      try {
        return await originalGetUser(...args)
      } catch {
        return { data: { user: null }, error: null } as any
      }
    }

    const { data } = await supabase.auth.getUser()
    return { supabaseResponse, user: data.user ?? null }
  } catch {
    return { supabaseResponse, user: null }
  }
}
