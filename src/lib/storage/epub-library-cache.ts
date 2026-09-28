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

/** Covers at or under this size are cached as-is; bigger ones are shrunk first. */
const THUMBNAIL_SOURCE_MAX_CHARS = 40_000
/** Cached cover width: a mobile card is ~170 CSS px wide, so this covers a 2x screen. */
const THUMBNAIL_WIDTH = 360
const THUMBNAIL_TIMEOUT_MS = 2000

const thumbnails = new Map<string, Promise<string>>()

/**
 * A small JPEG copy of `cover` for the localStorage cache. A cover's `data:` URL can be up to
 * 450k characters, and on iOS Safari localStorage is ~5MB shared with the translation cache
 * (up to 3MB) -- so caching two or four full-size covers overflowed it, the write threw, and
 * every visit went back to waiting on the network. A 360px JPEG is a few tens of KB. Falls
 * back to the original if it can't be decoded or drawn (it's only a cache).
 */
function thumbnailForCache(cover: string): Promise<string> {
  if (cover.length <= THUMBNAIL_SOURCE_MAX_CHARS || typeof document === "undefined") {
    return Promise.resolve(cover)
  }
  const existing = thumbnails.get(cover)
  if (existing) return existing
  const promise = new Promise<string>((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(cover), THUMBNAIL_TIMEOUT_MS)
    const done = (value: string) => {
      clearTimeout(timer)
      resolve(value)
    }
    img.onerror = () => done(cover)
    img.onload = () => {
      try {
        const scale = Math.min(1, THUMBNAIL_WIDTH / img.naturalWidth)
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const ctx = canvas.getContext("2d")
        if (!ctx) return done(cover)
        // JPEG has no alpha -- keep a transparent cover's background light rather than black.
        ctx.fillStyle = "#fff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const thumb = canvas.toDataURL("image/jpeg", 0.8)
        done(thumb.length < cover.length ? thumb : cover)
      } catch {
        done(cover)
      }
    }
    img.src = cover
  })
  // Only ever a handful of covers on the row; the bound just keeps a long session tidy.
  if (thumbnails.size > 16) thumbnails.clear()
  thumbnails.set(cover, promise)
  return promise
}

let latestWrite = 0

export function writeCachedLibraryBooks(
  user: User | null,
  books: LibraryEpub[],
  /** Known covers (null = none) -- only those for `keepCoverIds` are stored, as thumbnails. */
  covers: ReadonlyMap<string, string | null>,
  /** Ids whose cover is worth the space — the books currently on the Continue Reading row. */
  keepCoverIds: ReadonlySet<string>,
): void {
  const write = ++latestWrite
  const kept = [...covers].filter(([id]) => keepCoverIds.has(id))
  void Promise.all(
    kept.map(async ([id, cover]) => [id, cover ? await thumbnailForCache(cover) : null] as const),
  ).then((thumbs) => {
    // A newer write started while this one was shrinking covers -- it has the fresher data.
    if (write !== latestWrite) return
    const rows = books.map((book) => ({ ...book, coverImage: null }))
    const scope = scopeKeyFor(user)
    try {
      // The v1 copy can hold a couple of ~450k-char covers -- free that space for this one.
      localStorage.removeItem("lexa.libraryBooks.v1")
      const entry: CachedLibrary = { books: rows, covers: Object.fromEntries(thumbs) }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [scope]: entry }))
    } catch {
      // Quota: still keep the listing, so the next visit can paint the row from cache (with
      // placeholder art until covers arrive) instead of holding skeletons for the network.
      try {
        const entry: CachedLibrary = { books: rows, covers: {} }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [scope]: entry }))
      } catch {
        /* private mode / truly full — the row just falls back to waiting for the network */
      }
    }
  })
}
