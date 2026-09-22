import type { User } from "@supabase/supabase-js"
import type { LibraryEpub } from "@/lib/storage/epub-library"

/**
 * Last known listing of a user's uploaded books, so the landing page's Continue Reading row
 * can render on first paint instead of waiting a network round trip on every load
 * (`listUserEpubs` is uncached — see its call site in landing-continue-reading.tsx).
 *
 * Mirrors the Discover catalog's cache (discover-catalog.ts) and makes the same trade: a book
 * deleted on another device can appear for the moment before the real listing answers.
 *
 * Covers are the reason this isn't a plain dump of the listing. A `cover_image` is an embedded
 * `data:` URL of up to MAX_COVER_IMAGE_CHARS (450k), so a modest library would blow
 * localStorage's ~5MB budget on its own. Metadata for every book is kept — it's small, and the
 * row matches reading history against the whole listing — while covers are kept only for the
 * books actually on the row, which is what first paint needs and is bounded by its item cap.
 */
const STORAGE_KEY = "lexa.libraryBooks.v1"

/** Matches `scopeKeyFor` in reading-progress-storage.ts so both keep the same guest bucket. */
function scopeKeyFor(user: User | null): string {
  return user?.id ?? "guest"
}

function readAll(): Record<string, LibraryEpub[]> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, LibraryEpub[]>) : {}
  } catch {
    return {}
  }
}

/** Null (not `[]`) when nothing is cached, so a cold cache is distinguishable from an empty library. */
export function readCachedLibraryBooks(user: User | null): LibraryEpub[] | null {
  const rows = readAll()[scopeKeyFor(user)]
  return Array.isArray(rows) ? rows : null
}

export function writeCachedLibraryBooks(
  user: User | null,
  books: LibraryEpub[],
  /** Ids whose cover is worth the space — the books currently on the Continue Reading row. */
  keepCoverIds: ReadonlySet<string>,
): void {
  const trimmed = books.map((book) =>
    keepCoverIds.has(book.id) ? book : { ...book, coverImage: null },
  )
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [scopeKeyFor(user)]: trimmed }))
  } catch {
    /* quota / private mode — the row just falls back to waiting for the network */
  }
}
