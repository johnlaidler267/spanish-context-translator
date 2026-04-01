/**
 * Standard CORS headers for Supabase Edge Functions called from the browser.
 * In production, restrict Access-Control-Allow-Origin to your app domain.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  /** Must cover headers the browser lists in Access-Control-Request-Headers (case-insensitive). */
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept-profile, content-profile",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  /** Cache preflight to reduce OPTIONS traffic (optional). */
  "Access-Control-Max-Age": "86400",
}

/** Respond to a CORS preflight request (200 + empty body — some stacks mishandle 204). */
export function handleCorsPreflightRequest(): Response {
  return new Response("", { status: 200, headers: corsHeaders })
}

/** Attach CORS headers to any response. */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}
