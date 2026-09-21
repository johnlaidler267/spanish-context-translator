import type { User } from "@supabase/supabase-js"
import { fetchGeminiChatViaEdge } from "@/lib/groq-edge"
import { getCachedSupabaseAccessToken } from "@/lib/supabase"
import { parseChatJsonErrorBody, stringifyMessageContent } from "@/lib/translate/chat-completion"
import { pageSourceText } from "@/lib/translate/page-split"
import { getCachedPageRecap, setCachedPageRecap } from "@/lib/storage/reading-recap-storage"
import { pushPageRecap } from "@/lib/storage/reading-progress-sync"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

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
    const res = await fetchGeminiChatViaEdge(
      {
        model: RECAP_MODEL,
        messages: [
          { role: "system", content: RECAP_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        max_tokens: RECAP_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      },
      // This call is now sometimes fired from a `pagehide`/tab-close handler (see
      // maybeSummarizePreviousPageOnLeave's callers in App.tsx) -- keepalive gives it a real
      // shot at completing instead of getting cut off the instant the page starts unloading.
      // The body here is tiny (one page of text, capped output), well under the browser's
      // keepalive size limit.
      { keepalive: true },
    )
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

interface RecapLeaveParams {
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
}

/**
 * Shared "is there anything worth summarizing, and is it already cached" guard for both
 * `maybeSummarizePreviousPageOnLeave` and `sendPageRecapBeaconOnLeave` below. Returns null (no
 * network call warranted) when there's no previous page to summarize (resuming on page 1) or a
 * cached recap for this exact previous page already exists.
 */
function resolveRecapTarget(params: RecapLeaveParams): {
  contentId: string
  previousPageIndex: number
  previousPageSentenceIndex: number | null
  previousPageText: string
} | null {
  const { user, contentId, leavingAtPageIndex, pages, pageStartSentenceIndices } = params
  if (!contentId) return null
  const previousPageIndex = leavingAtPageIndex - 1
  if (previousPageIndex < 0) return null
  const previousPage = pages[previousPageIndex]
  if (!previousPage || previousPage.length === 0) return null
  const previousPageSentenceIndex = pageStartSentenceIndices?.[previousPageIndex] ?? null
  if (getCachedPageRecap(user, contentId, previousPageIndex, previousPageSentenceIndex) != null) {
    return null
  }
  return {
    contentId,
    previousPageIndex,
    previousPageSentenceIndex,
    previousPageText: pageSourceText(previousPage),
  }
}

/**
 * Orchestrates the whole "leaving the book" recap step with a normal two-way `fetch`: calls
 * Gemini, waits for the reply, and caches the result locally (reading-recap-storage.ts) and to
 * the cloud (pushPageRecap) -- see reading-progress-sync.ts. Safe to use whenever the tab isn't
 * actively tearing down as the call happens: the reading-session cleanup effect in App.tsx
 * (same-tab SPA navigation away -- back arrow, switching books) and the background reopen-time
 * prime (nothing cached yet for the resumed position). For the `pagehide`/`visibilitychange`
 * (tab close/backgrounding) case, use `sendPageRecapBeaconOnLeave` instead -- see its docstring
 * for why a plain awaited fetch is the wrong tool there even with `keepalive`.
 *
 * No-ops (no network call at all) when `resolveRecapTarget` finds nothing to do, or when a call
 * for this same book/page is already in flight -- whichever call lands first among any callers
 * racing for the same leave/position is the only one that actually pays for a request.
 */
export async function maybeSummarizePreviousPageOnLeave(params: RecapLeaveParams): Promise<void> {
  const { user, leavingAtPageIndex, pages, pageStartSentenceIndices } = params
  const target = resolveRecapTarget(params)
  if (!target) return
  const { contentId, previousPageIndex, previousPageSentenceIndex, previousPageText } = target

  const key = `${user?.id ?? "guest"}:${contentId}:${previousPageIndex}`
  if (recapInFlight.has(key)) return
  recapInFlight.add(key)
  try {
    const summary = await summarizePreviousPageForRecap(previousPageText)
    if (summary) {
      setCachedPageRecap(user, contentId, previousPageIndex, summary, previousPageSentenceIndex)
      // ...and to this reader's `reading_progress` row, so the one call we just paid for is
      // still there when they resume in a different browser/device -- otherwise the recap is
      // stranded in this browser's localStorage while the position itself syncs fine, and the
      // modal falls back to its verbatim excerpt over there. Best-effort and non-blocking:
      // see pushPageRecap, which no-ops for guests and swallows every failure.
      void pushPageRecap({
        user,
        contentId,
        summary,
        forPageIndex: previousPageIndex,
        forSentenceIndex: previousPageSentenceIndex,
        position: {
          pageIndex: leavingAtPageIndex,
          totalPages: pages.length,
          sentenceIndex: pageStartSentenceIndices?.[leavingAtPageIndex] ?? null,
        },
      })
    }
  } finally {
    recapInFlight.delete(key)
  }
}

/** Keys already sent via `sendPageRecapBeaconOnLeave` this session -- see its docstring. Never
 *  cleared: a beacon has no completion signal to clear it on, and re-sending for the exact same
 *  leave point in the same session isn't worth the duplicate Gemini call. */
const beaconSent = new Set<string>()

/**
 * The `pagehide`/`visibilitychange`-hidden (tab close/backgrounding) counterpart to
 * `maybeSummarizePreviousPageOnLeave`, using `navigator.sendBeacon` instead of a normal `fetch`.
 *
 * Root cause this works around: a request kicked off from a `pagehide`/`visibilitychange`
 * handler -- even with `fetch(..., { keepalive: true })` -- is routinely cut off by the browser
 * before the response comes back, because the tab is tearing down at that exact moment. That
 * silently leaves nothing cached for this leave point, and the *next* time this book is opened,
 * "Where you left off" falls back to its verbatim excerpt instead of showing an AI summary --
 * far more often than a genuine "the LLM call failed" rate would explain. `sendBeacon` is what
 * browsers provide for exactly this moment: the request is guaranteed to actually go out even
 * as the page unloads.
 *
 * The trade-off: a beacon can't carry an `Authorization` header, and there's no response for
 * this tab to read -- so unlike the awaited version, this can't call Gemini and write the
 * result itself. Instead it fires one beacon at the `recap-beacon` Edge Function (carrying a
 * Supabase access token *in the body*, read synchronously via `getCachedSupabaseAccessToken` so
 * there's no `await supabase.auth.getSession()` for the tearing-down tab to wait on) and that
 * function does the two-way work -- call Gemini, write the reader's `reading_progress` row --
 * server-side, where nothing is unloading. This browser can't update its own local cache from a
 * beacon it'll never see the reply to; the written cloud row is picked up on the *next* reopen
 * (any device) via `ensureCloudReadingProgressPulled`'s cloud-to-local merge.
 *
 * Falls back to the old best-effort `fetch`-with-`keepalive` path (via
 * `summarizePreviousPageForRecap`, same as before this beacon existed) for a guest or anyone
 * with no cached access token -- there's no `reading_progress` row for the beacon's server side
 * to write to without a signed-in user anyway -- and for a browser without `sendBeacon` support.
 */
export function sendPageRecapBeaconOnLeave(params: RecapLeaveParams): void {
  const { user, leavingAtPageIndex, pages, pageStartSentenceIndices } = params
  const target = resolveRecapTarget(params)
  if (!target) return
  const { contentId, previousPageIndex, previousPageSentenceIndex, previousPageText } = target

  const accessToken = user ? getCachedSupabaseAccessToken() : null
  if (!accessToken || typeof navigator === "undefined" || !navigator.sendBeacon) {
    void maybeSummarizePreviousPageOnLeave(params)
    return
  }

  const key = `${user?.id ?? "guest"}:${contentId}:${previousPageIndex}`
  if (beaconSent.has(key)) return

  const payload = {
    access_token: accessToken,
    contentId,
    previousPageSourceText: previousPageText,
    forPageIndex: previousPageIndex,
    forSentenceIndex: previousPageSentenceIndex,
    position: {
      pageIndex: leavingAtPageIndex,
      totalPages: pages.length,
      sentenceIndex: pageStartSentenceIndices?.[leavingAtPageIndex] ?? null,
    },
  }
  const sent = navigator.sendBeacon(
    `${supabaseUrl}/functions/v1/recap-beacon`,
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  )
  // sendBeacon returning false means the browser refused to queue it (e.g. over its payload
  // size limit) -- fall back to the old best-effort path rather than lose the recap entirely.
  if (sent) {
    beaconSent.add(key)
  } else {
    void maybeSummarizePreviousPageOnLeave(params)
  }
}
