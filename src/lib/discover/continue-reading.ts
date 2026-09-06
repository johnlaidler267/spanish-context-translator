import type { ContentItem } from "@/lib/discover/content-data"
import type { LibraryEpub } from "@/lib/storage/epub-library"
import type { RecentlyViewedEntry } from "@/lib/storage/reading-progress-storage"

/** Same rounding/clamp as reading-progress-storage.ts's `getReadingProgressPercent` -- kept in
 *  sync here since this module works off `RecentlyViewedEntry`s directly rather than re-reading
 *  localStorage per id. */
function percentFor(entry: RecentlyViewedEntry): number | null {
  if (!entry.totalPages || entry.totalPages <= 0) return null
  return Math.min(100, Math.max(1, Math.round(((entry.pageIndex + 1) / entry.totalPages) * 100)))
}

/** One row of the landing page's Continue Reading section -- either a Discover catalog item or
 *  one of the reader's own uploaded books, tagged so the caller knows which card/resume handler
 *  to use for it. */
export type ContinueReadingItem =
  | { kind: "discover"; content: ContentItem; percent: number | null }
  | { kind: "library"; book: LibraryEpub; percent: number | null }

/**
 * Merges "recently viewed" progress entries (which cover Discover items and personal-library
 * books alike -- both are just `content_id`s in the same `reading_progress` store, see
 * reading-progress-storage.ts) against the current Discover catalog and library listing, and
 * returns up to `limit` rows in the same order as `recent` -- i.e. by actual last-read recency,
 * not grouped by source.
 *
 * `recent` should be fetched with a lookback larger than `limit`: an entry whose content has
 * since been removed from the Discover catalog or deleted from the library is silently skipped
 * rather than counted against the cap, so passing exactly `limit` raw entries can under-fill the
 * result even when older, still-valid entries exist further back.
 */
export function buildContinueReadingItems(
  recent: RecentlyViewedEntry[],
  catalog: ContentItem[],
  libraryBooks: LibraryEpub[],
  limit: number,
): ContinueReadingItem[] {
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const libraryById = new Map(libraryBooks.map((book) => [book.id, book]))
  const result: ContinueReadingItem[] = []

  for (const entry of recent) {
    if (result.length >= limit) break
    const content = byId.get(entry.contentId)
    if (content) {
      result.push({ kind: "discover", content, percent: percentFor(entry) })
      continue
    }
    const book = libraryById.get(entry.contentId)
    if (book) {
      result.push({ kind: "library", book, percent: percentFor(entry) })
    }
  }

  return result
}
