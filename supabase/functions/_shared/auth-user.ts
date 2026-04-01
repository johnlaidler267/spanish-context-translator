/**
 * Verify the caller's Supabase JWT (including anonymous users).
 * Used by Groq-proxy functions so the API key stays server-side only.
 */

import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "./cors.ts"

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

/** Returns a Supabase user, or a 401 Response to return from the handler. */
export async function requireAuthUser(req: Request): Promise<Response | { id: string }> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Unauthorized", 401)
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return jsonError("Unauthorized", 401)
  }
  return user
}
