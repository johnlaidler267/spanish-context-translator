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
// v2: covers moved out of the book rows into their own map, so "this book has no cover" (null)
// is distinguishable from "cover not cached". v1 wrote null for both, so a coverless book on
// the row read as unknown on every visit and the row held its placeholders to re-fetch it.
const STORAGE_KEY = "lexa.libraryBooks.v2"

interface CachedLibrary {
  /** Every book's metadata, with `coverImage` always null -- covers live in `covers`. */
  books: LibraryEpub[]
  /** Known covers by book id (null = the book has none), only for books on the row. */
  covers: Record<string, string | null>
}

/** Matches `scopeKeyFor` in reading-progress-storage.ts so both keep the same guest bucket. */
function scopeKeyFor(user: User | null): string {
  return user?.id ?? "guest"
}

function readAll(): Record<string, CachedLibrary> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CachedLibrary>) : {}
  } catch {
    return {}
  }
}

function readEntry(user: User | null): CachedLibrary | null {
  const entry = readAll()[scopeKeyFor(user)]
  return entry && Array.isArray(entry.books) ? entry : null
}

/** Null (not `[]`) when nothing is cached, so a cold cache is distinguishable from an empty library. */
export function readCachedLibraryBooks(user: User | null): LibraryEpub[] | null {
  return readEntry(user)?.books ?? null
}

/** Covers cached for the books last on the row, by id (null = the book has none). */
export function readCachedLibraryCovers(user: User | null): Map<string, string | null> {
  const covers = readEntry(user)?.covers
  return new Map(covers && typeof covers === "object" ? Object.entries(covers) : [])
}

export function writeCachedLibraryBooks(
  user: User | null,
  books: LibraryEpub[],
  /** Known covers (null = none) -- only those for `keepCoverIds` are stored. */
  covers: ReadonlyMap<string, string | null>,
  /** Ids whose cover is worth the space — the books currently on the Continue Reading row. */
  keepCoverIds: ReadonlySet<string>,
): void {
  const entry: CachedLibrary = {
    books: books.map((book) => ({ ...book, coverImage: null })),
    covers: Object.fromEntries([...covers].filter(([id]) => keepCoverIds.has(id))),
  }
  try {
    // The v1 copy can hold a couple of ~450k-char covers -- free that space for this one.
    localStorage.removeItem("lexa.libraryBooks.v1")
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [scopeKeyFor(user)]: entry }))
  } catch {
    /* quota / private mode — the row just falls back to waiting for the network */
  }
}
