/**
 * Supabase client singleton — typed against the full database schema.
 *
 * Required env vars (set in .env):
 *   VITE_SUPABASE_URL       — e.g. https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — the project's public anon key
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/db.types"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.",
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Get the current session's JWT access token.
 * Returns null if the user is not authenticated.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
