"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { ContentCard } from "@/pages/discover/content-card"
import { LibraryCard } from "@/components/library/library-card"
import { fetchDiscoverCatalog, readCachedDiscoverItems } from "@/lib/discover/discover-catalog"
import { buildContinueReadingItems } from "@/lib/discover/continue-reading"
import { listUserEpubs, type LibraryEpub } from "@/lib/storage/epub-library"
import { getRecentlyViewedProgress } from "@/lib/storage/reading-progress-storage"
import { ensureCloudReadingProgressPulled } from "@/lib/storage/reading-progress-sync"
import type { ContentItem } from "@/lib/discover/content-data"

/** Capped at 4 so the row never overflows into a horizontal scrollbar at typical widths --
 *  see .continue-reading__row in index.css for the card-width math this relies on. */
const MAX_CONTINUE_READING_ITEMS = 4

/** Mobile row shows two reduced-height cards side by side -- see .continue-reading-mobile__row
 *  in index.css. Takes the first two of the same (already recency-ordered) list the desktop
 *  row uses rather than fetching/ordering separately. */
const MAX_MOBILE_CONTINUE_READING_ITEMS = 2

/**
 * How many raw "recently viewed" entries to pull before matching them against the Discover
 * catalog / library listing and capping at MAX_CONTINUE_READING_ITEMS -- wider than the cap so
 * an entry for since-removed Discover content or a deleted library book (skipped by
 * buildContinueReadingItems) doesn't shrink the row below 4 when older, still-valid entries
 * exist further back.
 */
const RECENT_LOOKBACK_ITEMS = 25

interface UseLandingContinueReadingOptions {
  user: User | null
  onContinue: (content: ContentItem) => void
  /** Resumes a personal upload -- same onStartReading/handleLibraryStartReading pipeline used by
   *  the Library page's own cards (see src/App.tsx), so a book opened from here behaves
   *  identically to one opened from /library. */
  onOpenLibraryBook: (book: LibraryEpub) => Promise<void> | void
  /**
   * Rendered instead when there's no reading history yet, or the Discover catalog hasn't
   * loaded (e.g. a brand-new session before the background prefetch lands) — the sample
   * excerpt this row normally sits in place of, passed in by landing-screen.tsx so this
   * component owns the empty/fallback decision instead of duplicating it in the caller.
   */
  fallback: ReactNode
}

/**
 * "Continue Reading" section — one data fetch, two renderings so mobile and desktop don't each
 * fire their own catalog/library/progress calls. Shows the reader's most recently-viewed content
 * with a rough "how far in" indicator. Sources from both the Discover catalog and the reader's
 * own uploaded library (src/lib/storage/epub-library.ts), interleaved by actual last-read
 * recency rather than always showing Discover items first -- see buildContinueReadingItems.
 *
 * Returns the mobile and desktop renderings as separate nodes (rather than one JSX element)
 * because they don't sit next to each other in the tree: on mobile the row has to land
 * *inside* landing-screen.tsx's filigree-divider/composer wrapper (between the divider and the
 * composer form -- see the `mobileRow` placement there), while the desktop row stays where the
 * sample-excerpt fallback normally goes, below the composer. A single JSX element can't be
 * physically split across two unrelated spots in the parent's tree, so this is a hook instead of
 * a component -- landing-screen.tsx calls it once and places each half itself.
 */
export function useLandingContinueReading({
  user,
  onContinue,
  onOpenLibraryBook,
  fallback,
}: UseLandingContinueReadingOptions): { mobileRow: ReactNode; desktopRow: ReactNode } {
  const [catalog, setCatalog] = useState<ContentItem[]>(() => readCachedDiscoverItems() ?? [])
  const [libraryBooks, setLibraryBooks] = useState<LibraryEpub[]>([])
  // Bumped once cloud-synced progress (see reading-progress-sync.ts) has been merged into the
  // localStorage cache below, so this row also reflects progress made on another device
  // instead of only whatever this browser already knew about.
  const [syncVersion, setSyncVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Same fetchDiscoverCatalog() Discover's own page and App.tsx's background prefetch call
    // (see discover-catalog.ts) — shares the in-flight/localStorage cache rather than firing
    // a separate request, and keeps this row's covers/titles fresh once it resolves.
    void fetchDiscoverCatalog().then((result) => {
      if (cancelled || !("items" in result)) return
      setCatalog(result.items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void listUserEpubs(user).then((books) => {
      if (!cancelled) setLibraryBooks(books)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    void ensureCloudReadingProgressPulled(user).then(() => {
      if (!cancelled) setSyncVersion((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const items = useMemo(() => {
    if (catalog.length === 0 && libraryBooks.length === 0) return []
    const recent = getRecentlyViewedProgress(user, RECENT_LOOKBACK_ITEMS)
    return buildContinueReadingItems(recent, catalog, libraryBooks, MAX_CONTINUE_READING_ITEMS)
    // `syncVersion` isn't read above -- it's a deliberate recompute trigger so this memo
    // reruns once cloud-synced progress has landed in localStorage (see the effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, libraryBooks, user, syncVersion])

  if (items.length === 0) return { mobileRow: null, desktopRow: fallback }

  const mobileItems = items.slice(0, MAX_MOBILE_CONTINUE_READING_ITEMS)

  return {
    // No label on mobile (removed per design) -- just the two cards. Caller renders this as a
    // sibling of the filigree divider and composer form, inside their shared flex wrapper (see
    // landing-screen.tsx) -- order-2 puts it between the divider (order-1) and the composer
    // (bumped to order-3 there). md:hidden drops it out of the desktop flex layout entirely, so
    // its lack of an explicit md:order doesn't matter there.
    mobileRow: (
      <div className="continue-reading-mobile w-full entry-4 order-2 md:hidden">
        <div className="continue-reading-mobile__row">
          {mobileItems.map((item) =>
            item.kind === "discover" ? (
              <ContentCard
                key={`mobile-discover-${item.content.id}`}
                content={item.content}
                onClick={() => onContinue(item.content)}
                progressPercent={item.percent}
                eagerCover
              />
            ) : (
              <LibraryCard
                key={`mobile-library-${item.book.id}`}
                book={item.book}
                progressPercent={item.percent}
                onOpen={() => onOpenLibraryBook(item.book)}
              />
            ),
          )}
        </div>
      </div>
    ),
    // Desktop: sits where the sample excerpt normally does, below the composer.
    desktopRow: (
      <div className="continue-reading w-full entry-4 order-3 md:order-3 mt-0 md:mt-1 hidden md:block">
        <p className="sample-excerpt-label text-center">Continue reading</p>
        <div className="continue-reading__row">
          {items.map((item) =>
            item.kind === "discover" ? (
              <ContentCard
                key={`discover-${item.content.id}`}
                content={item.content}
                onClick={() => onContinue(item.content)}
                progressPercent={item.percent}
                eagerCover
              />
            ) : (
              <LibraryCard
                key={`library-${item.book.id}`}
                book={item.book}
                progressPercent={item.percent}
                onOpen={() => onOpenLibraryBook(item.book)}
              />
            ),
          )}
        </div>
      </div>
    ),
  }
}
