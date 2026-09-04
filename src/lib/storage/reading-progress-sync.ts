import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { mergeCloudProgress, type CloudProgressRow } from "@/lib/storage/reading-progress-storage"

/**
 * Cross-device sync for reading-progress-storage.ts's localStorage cache, backed by the
 * `reading_progress` Supabase table (see supabase/migrations/0016_reading_progress.sql).
 *
 * Two halves:
 *  - `pushReadingProgress` — debounced upsert, called right after every local write so the
 *    cloud row catches up shortly after localStorage does.
 *  - `ensureCloudReadingProgressPulled` — pulls this user's rows once per session/user and
 *    merges them into localStorage (see mergeCloudProgress) so the existing synchronous local
 *    reads (getReadingProgress/hasReadingProgress/getRecentlyViewedProgress) transparently
 *    pick up progress made on another device, with no call-site changes beyond awaiting this
 *    once before the first read.
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
      const { data, error } = await supabase
        .from("reading_progress")
        .select("content_id, page_index, total_pages, updated_at")
        .eq("user_id", userKey)
      if (error || !data) {
        if (error) console.warn("[reading-progress] cloud pull failed:", error.message)
        return
      }
      const rows: CloudProgressRow[] = (data as ReadingProgressSyncRow[]).map((row) => ({
        contentId: row.content_id,
        pageIndex: row.page_index,
        totalPages: row.total_pages,
        updatedAt: new Date(row.updated_at).getTime(),
      }))
      mergeCloudProgress(user, rows)
    } catch (e) {
      console.warn("[reading-progress] cloud pull failed:", e)
    }
  })()
  return pullPromise
}

/** Test-only: clears the debounce timers and the per-user pull cache. */
export function resetReadingProgressSyncCache(): void {
  for (const timer of pendingPushes.values()) clearTimeout(timer)
  pendingPushes.clear()
  pulledForUserKey = undefined
  pullPromise = null
}
