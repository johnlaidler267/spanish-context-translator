/**
 * Standard CORS headers for Supabase Edge Functions called from the browser.
 * In production, restrict Access-Control-Allow-Origin to your app domain.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/** Respond to a CORS preflight request. */
export function handleCorsPreflightRequest(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

/** Attach CORS headers to any response. */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}
