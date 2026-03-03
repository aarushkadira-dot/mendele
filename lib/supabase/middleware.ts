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

  // If env vars are missing, pass through without auth
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[middleware] Supabase env vars missing — skipping auth')
    return { supabaseResponse: NextResponse.next({ request }), user: null }
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => {
              supabaseResponse.cookies.set(name, value, options)
            })
          } catch {
            // Ignore cookie errors
          }
        },
      },
    })

    const { data } = await supabase.auth.getUser()
    return { supabaseResponse, user: data.user ?? null }
  } catch (err) {
    console.warn('[middleware] Supabase auth error — continuing as unauthenticated:', String(err))
    return { supabaseResponse, user: null }
  }
}
