import { createBrowserClient } from "@supabase/ssr"
import { Database } from "@/lib/database.types"

export function createClient() {
  // Fallback placeholders prevent @supabase/ssr from throwing during build-time
  // static generation. Real values are injected via Vercel env vars at runtime.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key"
  )
}
