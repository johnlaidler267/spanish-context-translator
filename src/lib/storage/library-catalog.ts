import type { User } from "@supabase/supabase-js"
import { listUserEpubs, type LibraryEpub } from "@/lib/storage/epub-library"

/**
 * Background prefetch + cache for the personal EPUB library (`user_epubs`), mirroring
 * `discover-catalog.ts`'s fetch/cache-dedup shape for the Library page: the Library route
 * fetching only starts once it actually mounts (see the effect this replaces in
 * `src/pages/library/index.tsx`), so the query to Supabase serialized behind route/chunk
 * loading and painted a loading skeleton every single visit -- even for someone who was
 * just sitting on the landing page a moment before clicking into Library. Warming this in
 * the background (see the landing-page prefetch effect in App.tsx) means the page can often
 * paint from cache instantly instead.
 *
 * Kept as a plain in-memory module cache (not localStorage, unlike the Discover catalog):
 * this is one specific user's private book list, not shared public content, so it must never
 * survive a sign-out into a next session on the same device/browser -- `invalidateLibraryCache`
 * (called from auth-context on sign-out) drops it outright rather than trying to scope a
 * persistent store per user id.
 */

interface LibraryCacheEntry {
  userId: string
  items: LibraryEpub[]
}

let cache: LibraryCacheEntry | null = null

/** In-flight fetch, keyed by user id so a stale request for a since-signed-out-of user can't
 *  resolve into (or dedupe against) a different user's request. */
let inFlight: { userId: string; promise: Promise<LibraryEpub[]> } | null = null

/** This user's cached books, if any -- `null` on a cache miss (never fetched yet, or the
 *  cache belongs to a different user). Synchronous, so callers can use it as React initial
 *  state and paint before any network round trip resolves. */
export function readCachedLibraryEpubs(userId: string): LibraryEpub[] | null {
  return cache && cache.userId === userId ? cache.items : null
}

/** Overwrites the cache for `userId` -- used after a local mutation (upload/delete) so the
 *  cache doesn't go stale and clobber the just-changed list on the next read. */
export function writeCachedLibraryEpubs(userId: string, items: LibraryEpub[]) {
  cache = { userId, items }
}

/**
 * Fetches `user`'s library and refreshes the cache. This is the single fetch path for
 * Library content -- both the Library page's own on-mount load and the landing-page
 * background prefetch (see App.tsx) call this exact function, so they share one cache entry
 * and, if they overlap in time for the same user, one in-flight request rather than firing a
 * duplicate network call.
 *
 * Returns `[]` (and does not touch the cache) for a signed-out user, matching
 * `listUserEpubs`'s own guest handling -- there's nothing to prefetch or cache until a real
 * session exists.
 */
export function fetchLibraryCatalog(user: User | null): Promise<LibraryEpub[]> {
  if (!user) return Promise.resolve([])
  if (inFlight && inFlight.userId === user.id) return inFlight.promise

  const userId = user.id
  const promise = listUserEpubs(user).then((items) => {
    // Only commit to the cache if nothing has invalidated/replaced it for a different user
    // while this was in flight (e.g. a sign-out landed mid-request).
    if (inFlight?.userId === userId) writeCachedLibraryEpubs(userId, items)
    return items
  })
  promise.finally(() => {
    if (inFlight?.userId === userId) inFlight = null
  })
  inFlight = { userId, promise }
  return promise
}

/** Drops the cached library entirely -- call on sign-out so the next session on this
 *  device/browser (a different user, or the same one signing back in) never briefly sees a
 *  stale prior user's cached books before its own fetch resolves. */
export function invalidateLibraryCache() {
  cache = null
  inFlight = null
}
