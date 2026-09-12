import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { mergeCloudProgress, type CloudProgressRow } from "@/lib/storage/reading-progress-storage"
import { mergeCloudRecaps, type CloudRecapRow } from "@/lib/storage/reading-recap-storage"

/**
 * Cross-device sync for reading-progress-storage.ts's localStorage cache, backed by the
 * `reading_progress` Supabase table (see supabase/migrations/0016_reading_progress.sql).
 *
 * Three pieces:
 *  - `pushReadingProgress` — debounced upsert, called right after every local write so the
 *    cloud row catches up shortly after localStorage does.
 *  - `pushPageRecap` — writes the "Where you left off" LLM recap onto that same row, once,
 *    right after it's generated (see page-recap.ts). Separate request from the position push
 *    on purpose: see `recapColumnsMissing` below.
 *  - `ensureCloudReadingProgressPulled` — pulls this user's rows once per session/user and
 *    merges them into localStorage (see mergeCloudProgress / mergeCloudRecaps) so the existing
 *    synchronous local reads (getReadingProgress/hasReadingProgress/getRecentlyViewedProgress
 *    and getCachedPageRecap) transparently pick up progress *and* the recap made on another
 *    device, with no call-site changes beyond awaiting this once before the first read.
 *
 * Both are best-effort: a signed-out/no-session user (a guest who hasn't triggered the
 * anonymous Supabase session yet -- see groq-edge.ts) is skipped entirely, and any network or
 * RLS error is swallowed rather than surfaced -- the localStorage write already succeeded
 * before either of these is ever called, so a reader never loses their place over a flaky
 * connection, they just don't get the cross-device sync until the next successful call.
 */

interface ReadingProgressSyncRow {
  content_id: string
  page_index: number
  total_pages: number | null
  updated_at: string
  /** Absent on rows from a Supabase project that hasn't run the sentence-index migration yet,
   *  and null for rows written before this column existed -- both fall back to page_index. */
  sentence_index?: number | null
  /** Recap half of the row (0024_reading_progress_recap.sql). Absent on a project that hasn't
   *  run that migration yet, null on rows with no recap generated -- either way the "Where you
   *  left off" modal just falls back to its verbatim excerpt. */
  recap_summary?: string | null
  recap_for_page_index?: number | null
  recap_for_sentence_index?: number | null
  recap_updated_at?: string | null
}

/** Debounce so rapid page turns push one write per item, not one per page. */
const PUSH_DEBOUNCE_MS = 1500

const pendingPushes = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Schedules a debounced upsert of `contentId`'s progress to Supabase for `user`. Call this
 * right after `setReadingProgress` — see App.tsx's page-tracking effect. No-ops for a null
 * user; there's no account to sync to yet.
 */
export function pushReadingProgress(
  user: User | null,
  contentId: string,
  pageIndex: number,
  totalPages?: number,
  sentenceIndex?: number,
): void {
  if (!user || !Number.isFinite(pageIndex) || pageIndex < 0) return
  const key = `${user.id}:${contentId}`
  const existing = pendingPushes.get(key)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pendingPushes.delete(key)
    void supabase
      .from("reading_progress")
      .upsert(
        {
          user_id: user.id,
          content_id: contentId,
          page_index: pageIndex,
          total_pages:
            Number.isFinite(totalPages) && (totalPages as number) > 0 ? (totalPages as number) : null,
          sentence_index:
            Number.isFinite(sentenceIndex) && (sentenceIndex as number) >= 0
              ? (sentenceIndex as number)
              : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,content_id" },
      )
      .then(({ error }) => {
        if (error) console.warn("[reading-progress] cloud sync failed:", error.message)
      })
  }, PUSH_DEBOUNCE_MS)
  pendingPushes.set(key, timer)
}

/**
 * Latched once a write fails because the `recap_*` columns don't exist -- i.e. this project
 * hasn't run 0024_reading_progress_recap.sql yet. Everything recap-related then goes quiet for
 * the rest of the session instead of firing a doomed request after every book the reader
 * leaves; reading position and resuming keep working exactly as before, and the modal falls
 * back to its verbatim excerpt. Cleared by `resetReadingProgressSyncCache` (tests).
 */
let recapColumnsMissing = false

/** PostgREST's "column does not exist" schema-cache error -- see `recapColumnsMissing`. */
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // PGRST204 = column not found in schema cache (writes); 42703 = undefined_column (Postgres).
  if (error.code === "PGRST204" || error.code === "42703") return true
  return /recap_(summary|for_page_index|for_sentence_index|updated_at)/.test(error.message ?? "")
}

/**
 * Writes a freshly-generated "Where you left off" recap onto this user's `reading_progress`
 * row for `contentId`, so it's there the next time they resume this book in *any* browser --
 * see page-recap.ts, which calls this right after caching the recap locally. No-ops for a null
 * user (no account to sync to) and for a project without the recap columns.
 *
 * Deliberately its own request rather than folded into `pushReadingProgress`'s upsert: a
 * Supabase project that hasn't applied 0024 yet rejects the whole statement for the unknown
 * columns, and reading *position* must not stop syncing over a missing recap column.
 *
 * Updates the existing row rather than upserting, so it can't clobber a position written from
 * another device in the seconds this recap's LLM call was in flight. Falls back to an insert
 * (via upsert) only when there's no row yet -- the position push is debounced, so leaving a
 * book fast enough can land this first.
 */
export async function pushPageRecap(params: {
  user: User | null
  contentId: string
  summary: string
  /** Page the recap is *of* -- the one before the resume point. See reading-recap-storage.ts. */
  forPageIndex: number
  /** Device-independent anchor for that same page, when one was available. */
  forSentenceIndex?: number | null
  /** Position the reader left off at, used only if no row exists yet to attach the recap to. */
  position: { pageIndex: number; totalPages?: number; sentenceIndex?: number | null }
}): Promise<void> {
  const { user, contentId, summary, forPageIndex, forSentenceIndex, position } = params
  const trimmed = summary.trim()
  if (!user || !trimmed || recapColumnsMissing) return

  const recapFields = {
    recap_summary: trimmed,
    recap_for_page_index: forPageIndex,
    recap_for_sentence_index: forSentenceIndex ?? null,
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
      if (isMissingColumnError(error)) {
        recapColumnsMissing = true
        console.warn(
          "[reading-recap] cloud sync skipped: reading_progress is missing the recap columns " +
            "(apply supabase/migrations/0024_reading_progress_recap.sql). Recaps stay local-only.",
        )
      } else {
        console.warn("[reading-recap] cloud sync failed:", error.message)
      }
      return
    }
    if (data && data.length > 0) return

    // No row to attach to yet (the debounced position push hasn't landed) -- create it, with
    // the position the reader is leaving at so this can't write a row with a bogus page.
    const { error: insertError } = await supabase.from("reading_progress").upsert(
      {
        user_id: user.id,
        content_id: contentId,
        page_index: Math.max(0, position.pageIndex),
        total_pages:
          Number.isFinite(position.totalPages) && (position.totalPages as number) > 0
            ? (position.totalPages as number)
            : null,
        sentence_index:
          position.sentenceIndex != null && position.sentenceIndex >= 0 ? position.sentenceIndex : null,
        updated_at: new Date().toISOString(),
        ...recapFields,
      },
      { onConflict: "user_id,content_id" },
    )
    if (insertError) {
      if (isMissingColumnError(insertError)) recapColumnsMissing = true
      console.warn("[reading-recap] cloud sync failed:", insertError.message)
    }
  } catch (e) {
    console.warn("[reading-recap] cloud sync failed:", e)
  }
}

/** Which user id (or null for "no user") the cloud pull below has already run for. */
let pulledForUserKey: string | null | undefined
let pullPromise: Promise<void> | null = null

/**
 * Pulls all of `user`'s `reading_progress` rows and merges them into the localStorage cache.
 * Cached per user id — safe to call from render paths / effects on every mount, it only
 * actually hits the network once per signed-in user until `resetReadingProgressSyncCache` is
 * called (e.g. on sign-out) or the user id changes.
 */
export function ensureCloudReadingProgressPulled(user: User | null): Promise<void> {
  const userKey = user?.id ?? null
  if (pulledForUserKey === userKey && pullPromise) return pullPromise

  pulledForUserKey = userKey
  if (!userKey) {
    pullPromise = Promise.resolve()
    return pullPromise
  }

  pullPromise = (async () => {
    try {
      // `*` rather than a column list on purpose: PostgREST rejects the *whole* query with a
      // 400 if any named column doesn't exist, so naming a column from a migration this
      // project hasn't applied yet (sentence_index, or the recap_* columns) would take
      // cross-device resume down with it. `*` degrades to "that field is simply absent".
      const { data, error } = await supabase.from("reading_progress").select("*").eq("user_id", userKey)
      if (error || !data) {
        if (error) console.warn("[reading-progress] cloud pull failed:", error.message)
        return
      }
      const fetched = data as ReadingProgressSyncRow[]
      const rows: CloudProgressRow[] = fetched.map((row) => ({
        contentId: row.content_id,
        pageIndex: row.page_index,
        totalPages: row.total_pages,
        sentenceIndex: row.sentence_index ?? null,
        updatedAt: new Date(row.updated_at).getTime(),
      }))
      mergeCloudProgress(user, rows)

      // Recap half of the same rows -- see reading-recap-storage.ts. Timestamped by
      // `recap_updated_at` (falling back to the row's own `updated_at` for a recap written
      // before that column was populated) so an unchanged recap riding along with newer
      // progress can't outrank a fresher local one.
      const recaps: CloudRecapRow[] = fetched
        .filter((row) => typeof row.recap_summary === "string" && row.recap_summary.trim() !== "")
        .map((row) => ({
          contentId: row.content_id,
          summary: row.recap_summary as string,
          forPageIndex: row.recap_for_page_index ?? null,
          forSentenceIndex: row.recap_for_sentence_index ?? null,
          updatedAt: new Date(row.recap_updated_at ?? row.updated_at).getTime(),
        }))
      mergeCloudRecaps(user, recaps)
    } catch (e) {
      console.warn("[reading-progress] cloud pull failed:", e)
    }
  })()
  return pullPromise
}

/** Test-only: clears the debounce timers, the per-user pull cache, and the recap-column latch. */
export function resetReadingProgressSyncCache(): void {
  for (const timer of pendingPushes.values()) clearTimeout(timer)
  pendingPushes.clear()
  pulledForUserKey = undefined
  pullPromise = null
  recapColumnsMissing = false
}
