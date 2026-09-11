import type { User } from "@supabase/supabase-js"
import { fetchGeminiChatViaEdge } from "@/lib/groq-edge"
import { parseChatJsonErrorBody, stringifyMessageContent } from "@/lib/translate/chat-completion"
import { pageSourceText } from "@/lib/translate/page-split"
import { getCachedPageRecap, setCachedPageRecap } from "@/lib/storage/reading-recap-storage"

/**
 * Cheapest allowed `gemini-chat` model (see supabase/functions/gemini-chat/index.ts's
 * ALLOWED_MODELS) -- this is a "nice to have" recap, not core translation, so it's
 * deliberately the lowest-cost option rather than whatever model the app's main
 * translate flow is using.
 */
const RECAP_MODEL = "gemini-2.5-flash-lite"
const RECAP_MAX_OUTPUT_TOKENS = 120

/**
 * English output (not Spanish) to match `chunk-memory-trick`'s convention for this kind of
 * secondary, orienting-not-translating text aimed at an English-speaking learner -- the point
 * is to be instantly understood on glance, not to be more reading practice.
 */
const RECAP_SYSTEM_PROMPT =
  "You help a language learner resume a Spanish book or article they stepped away from. " +
  "They will send you the raw Spanish text of the page right before where they're about to " +
  "continue reading. Reply with exactly one concise sentence in plain English summarizing " +
  "what happens in it, so they're reminded what just happened before they pick back up. " +
  "No preamble, no quotes around it, no markdown -- just the one sentence."

/**
 * Calls `gemini-chat` (gemini-2.5-flash-lite) once for a one-sentence English recap of
 * `previousPageSourceText` -- raw Spanish. Never throws: any failure (network, non-2xx,
 * blocked/empty response) resolves to "" so a failed call is silently absorbed and the
 * "Where you left off" modal just falls back to the free verbatim excerpt instead of
 * surfacing an error for what is a nice-to-have.
 */
export async function summarizePreviousPageForRecap(
  previousPageSourceText: string,
): Promise<string> {
  const text = previousPageSourceText.trim()
  if (!text) return ""
  try {
    const res = await fetchGeminiChatViaEdge({
      model: RECAP_MODEL,
      messages: [
        { role: "system", content: RECAP_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: RECAP_MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    })
    if (!res.ok) {
      const detail = await parseChatJsonErrorBody(res)
      console.warn("[reading-recap] gemini-chat failed:", detail || res.status)
      return ""
    }
    const data: unknown = await res.json()
    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      ?.choices?.[0]?.message?.content
    return stringifyMessageContent(content)
  } catch (e) {
    console.warn("[reading-recap] gemini-chat request failed:", e)
    return ""
  }
}

/** In-flight dedupe key so a duplicate leave-trigger (e.g. a double effect-cleanup fire) can't start a second call for the same book/page while one is already running. */
const recapInFlight = new Set<string>()

/**
 * Orchestrates the whole "leaving the book" recap step: given the page the reader is on as
 * they leave (i.e. the page they'll resume to next time), summarizes the page *before* it and
 * caches the result -- see reading-recap-storage.ts. Called exactly once per leave from
 * App.tsx (see the reading-session cleanup effect there); safe to call defensively more than
 * once thanks to the in-flight/cache guards below, but the caller is still responsible for not
 * doing so on every page turn.
 *
 * No-ops (no network call at all) when:
 *  - there's no previous page to summarize (resuming on page 1), or
 *  - a cached recap for this exact previous page already exists (e.g. this exact leave point
 *    was already summarized once and never revisited past it), or
 *  - a call for this same book/page is already in flight.
 */
export async function maybeSummarizePreviousPageOnLeave(params: {
  user: User | null
  contentId: string | null
  /** 0-based page the reader is on as they leave -- becomes the next resume point. */
  leavingAtPageIndex: number
  pages: string[][]
  /**
   * Per-page sentence-index anchors for `pages` (see computePageStartSentenceIndices in
   * App.tsx) -- used to tag the cached recap with a device-independent position (see
   * `forSentenceIndex` in reading-recap-storage.ts) so it still matches on reopen even if that
   * happens on a different device, whose own page-split would otherwise disagree with this
   * device's raw page index for the same spot. Empty when no anchor was computed for this
   * session (see the ref's own docstring for when that happens); the recap still caches fine,
   * just without the cross-device match.
   */
  pageStartSentenceIndices?: number[]
}): Promise<void> {
  const { user, contentId, leavingAtPageIndex, pages, pageStartSentenceIndices } = params
  if (!contentId) return
  const previousPageIndex = leavingAtPageIndex - 1
  if (previousPageIndex < 0) return
  const previousPage = pages[previousPageIndex]
  if (!previousPage || previousPage.length === 0) return
  const previousPageSentenceIndex = pageStartSentenceIndices?.[previousPageIndex] ?? null

  if (
    getCachedPageRecap(user, contentId, previousPageIndex, previousPageSentenceIndex) != null
  ) {
    return
  }

  const key = `${user?.id ?? "guest"}:${contentId}:${previousPageIndex}`
  if (recapInFlight.has(key)) return
  recapInFlight.add(key)
  try {
    const summary = await summarizePreviousPageForRecap(pageSourceText(previousPage))
    if (summary) {
      setCachedPageRecap(user, contentId, previousPageIndex, summary, previousPageSentenceIndex)
    }
  } finally {
    recapInFlight.delete(key)
  }
}
