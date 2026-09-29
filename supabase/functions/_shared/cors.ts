/**
 * CORS for Supabase Edge Functions called from the browser.
 *
 * Only the app's own origins may call these functions from a web page. Allowed origins:
 *   - APP_URL (the same secret checkout/portal redirects use), plus its www/apex twin
 *   - ALLOWED_ORIGINS — optional comma-separated extras, e.g. a staging domain or Vercel
 *     previews. An entry may use `*` for one DNS label: `https://*-myteam.vercel.app`
 *   - localhost / 127.0.0.1 on any port, for `vite` dev and `supabase functions serve`
 *
 * If neither APP_URL nor ALLOWED_ORIGINS is set, every origin is allowed (the old `*`
 * behavior) so an unconfigured project keeps working -- a warning is logged instead.
 *
 * Requests with no Origin header (curl, cron, server-to-server) are not browser requests and
 * CORS doesn't apply to them; they pass through to the function's own auth checks.
 */

/** Headers every CORS response carries. Access-Control-Allow-Origin is added per request by `serveWithCors`. */
export const corsHeaders: Record<string, string> = {
  /** Must cover headers the browser lists in Access-Control-Request-Headers (case-insensitive). */
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept-profile, content-profile",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  /** Cache preflight to reduce OPTIONS traffic (optional). */
  "Access-Control-Max-Age": "86400",
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase()
}

/** APP_URL plus its www/apex twin, so `https://example.com` also admits `https://www.example.com`. */
function withWwwTwin(origin: string): string[] {
  const m = origin.match(/^(https?:\/\/)(www\.)?(.+)$/)
  if (!m) return [origin]
  return [`${m[1]}${m[3]}`, `${m[1]}www.${m[3]}`]
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+")
  return new RegExp(`^${escaped}$`)
}

export interface OriginPolicy {
  /** True when nothing is configured and every origin is allowed. */
  allowAll: boolean
  isAllowed(origin: string): boolean
}

export function buildOriginPolicy(appUrl: string | undefined, allowedOrigins: string | undefined): OriginPolicy {
  const exact = new Set<string>()
  const patterns: RegExp[] = []

  if (appUrl?.trim()) {
    for (const o of withWwwTwin(normalize(appUrl))) exact.add(o)
  }
  for (const raw of (allowedOrigins ?? "").split(",")) {
    const o = normalize(raw)
    if (!o) continue
    if (o.includes("*")) patterns.push(patternToRegExp(o))
    else exact.add(o)
  }

  const allowAll = exact.size === 0 && patterns.length === 0
  return {
    allowAll,
    isAllowed(origin: string): boolean {
      if (allowAll) return true
      const o = normalize(origin)
      return LOCAL_ORIGIN.test(o) || exact.has(o) || patterns.some((re) => re.test(o))
    },
  }
}

let cachedPolicy: OriginPolicy | null = null

function originPolicy(): OriginPolicy {
  if (!cachedPolicy) {
    cachedPolicy = buildOriginPolicy(Deno.env.get("APP_URL"), Deno.env.get("ALLOWED_ORIGINS"))
    if (cachedPolicy.allowAll) {
      console.warn("[cors] APP_URL / ALLOWED_ORIGINS not set -- allowing requests from any origin")
    }
  }
  return cachedPolicy
}

function applyCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  if (origin) headers.set("Access-Control-Allow-Origin", origin)
  headers.append("Vary", "Origin")
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/**
 * Wrap a handler so its responses carry CORS headers for allowed origins, preflight is answered
 * here, and browser requests from any other origin are refused with 403 before the handler runs
 * (CORS alone only stops the page *reading* the response -- the request would still execute and
 * spend model/API quota).
 */
export function withCorsPolicy(
  handler: (req: Request) => Response | Promise<Response>,
  policy: () => OriginPolicy = originPolicy,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const origin = req.headers.get("Origin")
    if (origin && !policy().isAllowed(origin)) {
      return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } })
    }
    // 200 + empty body -- some stacks mishandle 204 on preflight.
    if (req.method === "OPTIONS") return applyCors(new Response("", { status: 200 }), origin)
    return applyCors(await handler(req), origin)
  }
}

/** `Deno.serve` with the CORS policy above applied. Use this for every browser-callable function. */
export function serveWithCors(handler: (req: Request) => Response | Promise<Response>): void {
  Deno.serve(withCorsPolicy(handler))
}
