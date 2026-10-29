/**
 * Abuse ceiling for the AI proxy functions (groq-chat, gemini-chat, groq-transcribe,
 * chunk-details, chunk-memory-trick). They accept anonymous JWTs, so without this a
 * script could mint guest sessions and loop requests through our Groq/Gemini keys.
 *
 * These are not product limits (those live in tiers.ts / enforce-limits.ts) -- they're
 * set well above what a real reader does and exist only to bound spend. Counters are
 * per user and per IP (a fresh anonymous user per request still shares an IP), stored
 * in ai_rate_limits via the ai_rate_limit_hit() RPC (migration 0029).
 *
 * Fails open: if the RPC errors (e.g. migration not applied yet) the request goes
 * through and the error is logged, so a deploy-order slip can't take the app down.
 */

import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "./cors.ts"

const MINUTE = 60
const DAY = 86_400

/** Per-user caps, summed across all AI functions. */
const USER_PER_MINUTE = 30
const USER_PER_DAY = 1_000
/** Per-IP caps -- higher, since a school or office can share one address. */
const IP_PER_MINUTE = 90
const IP_PER_DAY = 3_000

/** First address in x-forwarded-for (the client; later entries are proxies). */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim()
  return ip || null
}

function tooManyRequests(message: string, retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
    },
  })
}

/** Returns a 429 Response to send back, or null when the request may proceed. */
export async function enforceAiRateLimit(
  req: Request,
  userId: string,
  endpoint: string,
): Promise<Response | null> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!serviceKey) {
    console.error(`[ai-rate-limit] ${endpoint}: SUPABASE_SERVICE_ROLE_KEY not set; skipping`)
    return null
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey)

  const checks = [
    { bucket: `user:${userId}:${MINUTE}`, window_seconds: MINUTE, max: USER_PER_MINUTE },
    { bucket: `user:${userId}:${DAY}`, window_seconds: DAY, max: USER_PER_DAY },
  ]
  const ip = clientIp(req)
  if (ip) {
    checks.push(
      { bucket: `ip:${ip}:${MINUTE}`, window_seconds: MINUTE, max: IP_PER_MINUTE },
      { bucket: `ip:${ip}:${DAY}`, window_seconds: DAY, max: IP_PER_DAY },
    )
  }

  const { data: exceeded, error } = await db.rpc("ai_rate_limit_hit", { p_checks: checks })
  if (error) {
    console.error(`[ai-rate-limit] ${endpoint}: rpc failed, allowing request:`, error.message)
    return null
  }
  if (typeof exceeded !== "string" || !exceeded) return null

  console.warn(`[ai-rate-limit] ${endpoint}: blocked user=${userId} ip=${ip ?? "?"} bucket=${exceeded}`)
  if (exceeded.endsWith(`:${DAY}`)) {
    // chat-completion.ts matches "daily usage limit" to skip its one-shot 429 retry,
    // since waiting a few seconds won't help until tomorrow.
    return tooManyRequests(
      "Daily usage limit reached. Please try again tomorrow.",
      DAY - (Math.floor(Date.now() / 1000) % DAY),
    )
  }
  return tooManyRequests(
    "Too many requests. Please wait a minute and try again.",
    MINUTE - (Math.floor(Date.now() / 1000) % MINUTE),
  )
}
