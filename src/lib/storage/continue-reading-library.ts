import type { User } from "@supabase/supabase-js"
import { fetchUserEpubCovers, listUserEpubs, type LibraryEpub } from "@/lib/storage/epub-library"
import { getRecentlyViewedProgress } from "@/lib/storage/reading-progress-storage"
import { ensureCloudReadingProgressPulled } from "@/lib/storage/reading-progress-sync"
import { getCachedSupabaseUser } from "@/lib/supabase"
import { MOBILE_MEDIA_QUERY } from "@/contexts/viewport-context"

/**
 * The landing page's Continue Reading row's view of the reader's uploaded library: the listing
 * *without* covers, plus covers fetched one by one for only the books the row shows.
 *
 * The full listing (library-catalog.ts, what the Library page uses) carries every book's cover
 * as an embedded data URL of up to ~450k characters, so a modest library is a multi-megabyte
 * response -- and the row can't render until the listing answers. On a phone that download was
 * why the cards filled in seconds after the rest of the page, to show at most two covers.
 *
 * Session-scoped, in memory, keyed by user id -- same reasoning as library-catalog.ts: private
 * per-user data that mustn't survive into another account's session. The row's own
 * localStorage cache (epub-library-cache.ts) is what carries covers across visits.
 */

/** Must match the row's caps in landing-continue-reading.tsx. */
export const MAX_CONTINUE_READING_ITEMS = 4
export const MAX_MOBILE_CONTINUE_READING_ITEMS = 2

let listing: { userId: string; inFlight: Promise<LibraryEpub[]> | null; books: LibraryEpub[] | null } | null =
  null
let covers: { userId: string; byId: Map<string, Promise<string | null>>; known: Map<string, string | null> } | null =
  null

/** This session's latest cover-less listing for `user`, if one has answered. */
export function readSessionLibraryListing(user: User | null): LibraryEpub[] | null {
  return user && listing?.userId === user.id ? listing.books : null
}

/**
 * Cover-less listing, shared: a call while one is in flight (typically the pre-mount warm-up
 * below) joins it rather than starting another. A call after it answered starts a fresh one --
 * each landing visit refreshes, so a book uploaded or deleted since shows up.
 */
export function fetchSessionLibraryListing(user: User | null): Promise<LibraryEpub[]> {
  if (!user) return Promise.resolve([])
  if (listing?.userId !== user.id) listing = { userId: user.id, inFlight: null, books: null }
  const entry = listing
  if (entry.inFlight) return entry.inFlight
  const promise = listUserEpubs(user, { covers: false }).then((books) => {
    entry.books = books
    entry.inFlight = null
    return books
  })
  entry.inFlight = promise
  return promise
}

function coverStore(user: User) {
  if (covers?.userId !== user.id) covers = { userId: user.id, byId: new Map(), known: new Map() }
  return covers
}

/** Covers this session already has for `user`, by book id (null = the book has none). */
export function readSessionLibraryCovers(user: User | null): ReadonlyMap<string, string | null> {
  return user && covers?.userId === user.id ? covers.known : new Map()
}

/** Fetches covers for whichever of `ids` this session hasn't already fetched or started. */
export function fetchSessionLibraryCovers(
  user: User | null,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  if (!user) return Promise.resolve(new Map())
  const store = coverStore(user)
  const missing = ids.filter((id) => !store.byId.has(id))
  if (missing.length > 0) {
    const batch = fetchUserEpubCovers(user, missing)
    for (const id of missing) {
      store.byId.set(
        id,
        batch.then((result) => {
          const cover = result[id] ?? null
          // A failed fetch comes back `{}` -- don't remember that as "no cover", so the next
          // landing visit tries again.
          if (id in result) store.known.set(id, cover)
          else store.byId.delete(id)
          return cover
        }),
      )
    }
  }
  return Promise.all(ids.map((id) => store.byId.get(id)!)).then(
    (values) => new Map(ids.map((id, i) => [id, values[i]!])),
  )
}

/**
 * Starts the listing -- and then the covers the row is about to show -- before React mounts,
 * alongside warmDiscoverFirstPaint / warmReadingProgressFirstPaint (see src/main.jsx), so both
 * download while the loading bar is still up.
 *
 * Which covers: the most recently read of the reader's own books, as many as the row has
 * slots at this viewport. That can overshoot what the row finally shows (Discover items
 * interleave by recency and take some slots), but never misses one of its library books --
 * and the row itself fetches any cover it's still missing.
 */
export function warmContinueReadingLibraryFirstPaint(): void {
  if (typeof window === "undefined") return
  const user = getCachedSupabaseUser()
  if (!user) return
  const slots = window.matchMedia(MOBILE_MEDIA_QUERY).matches
    ? MAX_MOBILE_CONTINUE_READING_ITEMS
    : MAX_CONTINUE_READING_ITEMS
  void Promise.all([fetchSessionLibraryListing(user), ensureCloudReadingProgressPulled(user)]).then(
    ([books]) => {
      const ids = new Set(books.map((book) => book.id))
      const recent = getRecentlyViewedProgress(user, 25)
        .map((entry) => entry.contentId)
        .filter((id) => ids.has(id))
        .slice(0, slots)
      void fetchSessionLibraryCovers(user, recent)
    },
  )
}

/** Drops everything on sign-out -- see invalidateLibraryCache for the same reasoning. */
export function invalidateContinueReadingLibrary(): void {
  listing = null
  covers = null
}
