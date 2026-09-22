"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { ContentCard } from "@/pages/discover/content-card"
import { LibraryCard } from "@/components/library/library-card"
import { DiscoverSkeletonCard } from "@/components/discover/discover-loading-state"
import { fetchDiscoverCatalog, readCachedDiscoverItems } from "@/lib/discover/discover-catalog"
import { buildContinueReadingItems } from "@/lib/discover/continue-reading"
import {
  readContinueReadingCount,
  writeContinueReadingCount,
} from "@/lib/storage/continue-reading-count"
import { listUserEpubs, type LibraryEpub } from "@/lib/storage/epub-library"
import { getRecentlyViewedProgress } from "@/lib/storage/reading-progress-storage"
import { ensureCloudReadingProgressPulled } from "@/lib/storage/reading-progress-sync"
import { useViewport } from "@/contexts/viewport-context"
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
 * Viewport detection happens in main.jsx (before React mounts) to determine which rendering to
 * use on first paint without flicker. This replaces the previous approach of rendering both
 * mobile and desktop rows in the DOM and hiding one with CSS.
 */
export function useLandingContinueReading({
  user,
  onContinue,
  onOpenLibraryBook,
  fallback,
}: UseLandingContinueReadingOptions): { mobileRow: ReactNode; desktopRow: ReactNode } {
  const { isMobile } = useViewport()
  const [catalog, setCatalog] = useState<ContentItem[]>(() => readCachedDiscoverItems() ?? [])
  const [libraryBooks, setLibraryBooks] = useState<LibraryEpub[]>([])
  // The row can't know how many cards it will have until both sources have answered, so until
  // then it reserves however many it held last time (see continue-reading-count.ts). The
  // catalog half starts settled when its localStorage cache was warm enough to seed `catalog`.
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [catalogLoaded, setCatalogLoaded] = useState(() => readCachedDiscoverItems() !== null)
  // Keyed on the user id rather than read once: the session is normally restored from
  // localStorage before first paint, but when it isn't, a one-shot read here would have
  // reserved the guest bucket's count for a signed-in reader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reservedCount = useMemo(() => readContinueReadingCount(user), [user?.id])
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
      if (cancelled) return
      if ("items" in result) setCatalog(result.items)
      // Settled either way — a failed catalog fetch must still release the placeholder,
      // or a reader whose row is all library books would sit on skeletons forever.
      setCatalogLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void listUserEpubs(user).then((books) => {
      if (cancelled) return
      setLibraryBooks(books)
      setLibraryLoaded(true)
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

  const resolved = libraryLoaded && catalogLoaded

  // Record what the next visit should reserve. In an effect, not in render: this writes to
  // localStorage, and render runs twice under StrictMode.
  useEffect(() => {
    if (resolved) writeContinueReadingCount(user, items.length)
  }, [resolved, items.length, user])

  // Reserve the row's space while the sources are still answering. Only with a remembered
  // count: a first-ever visit has nothing to promise, so it keeps today's behaviour of
  // rendering nothing rather than flashing placeholders at a reader who has no history.
  if (!resolved && items.length === 0 && reservedCount > 0) {
    const placeholders = (count: number) =>
      Array.from({ length: count }, (_, i) => (
        <DiscoverSkeletonCard key={`placeholder-${i}`} compact />
      ))

    return isMobile
      ? {
          mobileRow: (
            <div className="continue-reading-mobile w-full entry-4 order-2" aria-busy="true">
              <div className="continue-reading-mobile__row">
                {placeholders(Math.min(reservedCount, MAX_MOBILE_CONTINUE_READING_ITEMS))}
              </div>
            </div>
          ),
          desktopRow: null,
        }
      : {
          mobileRow: null,
          desktopRow: (
            <div
              className="continue-reading w-full entry-4 order-3 md:order-3 mt-0 md:mt-1"
              aria-busy="true"
            >
              <p className="sample-excerpt-label text-center">Continue reading</p>
              <div className="continue-reading__row">
                {placeholders(Math.min(reservedCount, MAX_CONTINUE_READING_ITEMS))}
              </div>
            </div>
          ),
        }
  }

  if (items.length === 0) return { mobileRow: null, desktopRow: fallback }

  const mobileItems = items.slice(0, MAX_MOBILE_CONTINUE_READING_ITEMS)

  // On mobile, render only mobileRow; on desktop, render only desktopRow. Viewport is detected
  // in main.jsx before React mounts to avoid first-paint flicker. This eliminates the
  // duplication of rendering both rows in the DOM and hiding one with CSS.
  if (isMobile) {
    return {
      // No label on mobile (removed per design) -- just the two cards. Caller renders this as a
      // sibling of the filigree divider and composer form, inside their shared flex wrapper (see
      // landing-screen.tsx) -- order-2 puts it between the divider (order-1) and the composer
      // (bumped to order-3 there).
      mobileRow: (
        <div className="continue-reading-mobile w-full entry-4 order-2">
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
      desktopRow: null,
    }
  }

  return {
    mobileRow: null,
    // Desktop: sits where the sample excerpt normally does, below the composer.
    desktopRow: (
      <div className="continue-reading w-full entry-4 order-3 md:order-3 mt-0 md:mt-1">
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
