/**
 * Fire-and-forget endpoint for the "Where you left off" recap when the reader closes the tab
 * or backgrounds the app -- see `sendPageRecapBeaconOnLeave` in src/lib/translate/page-recap.ts,
 * which calls this via `navigator.sendBeacon` instead of a normal `fetch`.
 *
 * Root cause this works around: a normal fetch (even with `keepalive: true`) started from a
 * `pagehide`/`visibilitychange` handler routinely gets cut off by the browser before the
 * response comes back, because the tab is tearing down at that exact moment -- so the reader is
 * left with no cached recap far more often than a genuine "the LLM call failed" rate would
 * explain, and the "Where you left off" modal falls back to its verbatim excerpt. `sendBeacon`
 * is built for exactly this moment (the browser guarantees the *request* goes out even as the
 * page unloads) but is one-way: no custom headers, no response the page can read. So the
 * two-way work this used to do client-side -- call Gemini, wait for the reply, write it to
 * Supabase -- happens here instead, server-side, where nothing is tearing down: the client just
 * fires the beacon and walks away, and this function calls Gemini and writes straight to the
 * reader's `reading_progress` row on its own.
 *
 * Not gateway-JWT-protected (see supabase/config.toml) because `sendBeacon` cannot set an
 * `Authorization` header -- same reason stripe-webhook is exempt. Auth instead comes from a
 * Supabase access token carried *in the body* (the same token a header would otherwise carry)
 * and verified below exactly like `requireAuthUser` (../_shared/auth-user.ts) does from one.
 */

import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

/** Mirrors RECAP_SYSTEM_PROMPT in src/lib/translate/page-recap.ts -- keep the two in sync. */
const RECAP_SYSTEM_PROMPT =
  "You help a language learner resume a Spanish book or article they stepped away from. " +
  "They will send you the raw Spanish text of the page right before where they're about to " +
  "continue reading. Reply with exactly one concise sentence in plain English summarizing " +
  "what happens in it, so they're reminded what just happened before they pick back up. " +
  "No preamble, no quotes around it, no markdown -- just the one sentence."

/** Mirrors RECAP_MODEL / RECAP_MAX_OUTPUT_TOKENS in page-recap.ts. */
const RECAP_MODEL = "gemini-2.5-flash-lite"
const RECAP_MAX_OUTPUT_TOKENS = 120
/** A real page of book text is a few hundred to low thousands of characters -- generous cap so a malformed/abusive beacon body can't smuggle an oversized prompt through an endpoint with no gateway-level JWT check. */
const MAX_PAGE_TEXT_LENGTH = 20000

interface RecapBeaconBody {
  access_token?: string
  contentId?: string
  previousPageSourceText?: string
  forPageIndex?: number
  forSentenceIndex?: number | null
  position?: {
    pageIndex?: number
    totalPages?: number | null
    sentenceIndex?: number | null
  }
}

/** PostgREST's "column does not exist" -- a project that hasn't run 0024_reading_progress_recap.sql yet. Mirrors isMissingColumnError in reading-progress-sync.ts. */
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === "PGRST204" || error.code === "42703") return true
  return /recap_(summary|for_page_index|for_sentence_index|updated_at)/.test(error.message ?? "")
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  let body: RecapBeaconBody
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: corsHeaders })
  }

  const accessToken = typeof body.access_token === "string" ? body.access_token : ""
  const contentId = typeof body.contentId === "string" ? body.contentId : ""
  const text =
    typeof body.previousPageSourceText === "string" ? body.previousPageSourceText.trim() : ""
  const forPageIndex = body.forPageIndex
  const position = body.position
  const positionPageIndex = position?.pageIndex

  if (
    !accessToken ||
    !contentId ||
    !text ||
    text.length > MAX_PAGE_TEXT_LENGTH ||
    typeof forPageIndex !== "number" ||
    !Number.isFinite(forPageIndex) ||
    forPageIndex < 0 ||
    typeof positionPageIndex !== "number" ||
    !Number.isFinite(positionPageIndex)
  ) {
    return new Response("Bad request", { status: 400, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!

  // Scoped to the caller -- RLS restricts every read/write below to this same user's own row,
  // exactly as if the browser had made the call itself with this token in an Authorization
  // header.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)
  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders })
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    console.error("[recap-beacon] GEMINI_API_KEY not set")
    return new Response("Service misconfigured", { status: 500, headers: corsHeaders })
  }

  let summary = ""
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${RECAP_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          systemInstruction: { parts: [{ text: RECAP_SYSTEM_PROMPT }] },
          generationConfig: { maxOutputTokens: RECAP_MAX_OUTPUT_TOKENS, temperature: 0.3 },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      },
    )
    const rawText = await geminiRes.text()
    if (geminiRes.ok) {
      const data = JSON.parse(rawText) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const parts = data.candidates?.[0]?.content?.parts
      summary = (parts?.map((p) => p.text ?? "").join("") ?? "").trim()
    } else {
      console.warn("[recap-beacon] gemini call failed:", geminiRes.status, rawText)
    }
  } catch (e) {
    console.warn("[recap-beacon] gemini call threw:", e)
  }

  // Matches summarizePreviousPageForRecap's contract: a failed/blocked/empty LLM call is
  // silently absorbed -- nothing to write, the modal just falls back to its verbatim excerpt.
  if (!summary) return noContent()

  const recapFields = {
    recap_summary: summary,
    recap_for_page_index: forPageIndex,
    recap_for_sentence_index:
      typeof body.forSentenceIndex === "number" && Number.isFinite(body.forSentenceIndex)
        ? body.forSentenceIndex
        : null,
    recap_updated_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await supabase
      .from("reading_progress")
      .update(recapFields)
      .eq("user_id", user.id)
      .eq("content_id", contentId)
      .select("content_id")

    if (error) {
      if (!isMissingColumnError(error)) console.warn("[recap-beacon] update failed:", error.message)
      return noContent()
    }

    if (!data || data.length === 0) {
      // No row yet for this book (the debounced position push from the client hasn't landed) --
      // create one with the position the reader is leaving at. Mirrors pushPageRecap's same
      // insert-via-upsert fallback in reading-progress-sync.ts.
      const { error: insertError } = await supabase.from("reading_progress").upsert(
        {
          user_id: user.id,
          content_id: contentId,
          page_index: Math.max(0, positionPageIndex),
          total_pages:
            typeof position?.totalPages === "number" && position.totalPages > 0
              ? position.totalPages
              : null,
          sentence_index:
            typeof position?.sentenceIndex === "number" && position.sentenceIndex >= 0
              ? position.sentenceIndex
              : null,
          updated_at: new Date().toISOString(),
          ...recapFields,
        },
        { onConflict: "user_id,content_id" },
      )
      if (insertError && !isMissingColumnError(insertError)) {
        console.warn("[recap-beacon] insert failed:", insertError.message)
      }
    }
  } catch (e) {
    console.warn("[recap-beacon] write failed:", e)
  }

  return noContent()
})
