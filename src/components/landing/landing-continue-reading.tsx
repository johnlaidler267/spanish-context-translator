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
import {
  readCachedLibraryBooks,
  writeCachedLibraryBooks,
} from "@/lib/storage/epub-library-cache"
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

/** Longest the row will hold its placeholders waiting for a source that may never answer. */
const SETTLE_TIMEOUT_MS = 2500

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
  const [libraryBooks, setLibraryBooks] = useState<LibraryEpub[]>(
    () => readCachedLibraryBooks(user) ?? [],
  )
  // The row can't know how many cards it will have until both sources have answered, so until
  // then it reserves however many it held last time (see continue-reading-count.ts). Either
  // half starts settled when its localStorage cache was warm enough to seed the state above.
  const [libraryLoaded, setLibraryLoaded] = useState(() => readCachedLibraryBooks(user) !== null)
  /** Distinct from `libraryLoaded`, which a warm cache satisfies — only the network refreshes the cache. */
  const [libraryLoadedFromNetwork, setLibraryLoadedFromNetwork] = useState(false)
  const [catalogLoaded, setCatalogLoaded] = useState(() => readCachedDiscoverItems() !== null)
  /**
   * Both sources answered from cache before first paint, so what the row computes now is a
   * complete answer rather than a partial one — the thing the settle gate below exists to
   * avoid showing. It may still be one sync behind, but cloud progress is merged *into*
   * localStorage (see mergeCloudProgress), so local history already carries everything the
   * cloud knew at the last visit; a pending pull can only add reading done elsewhere since.
   * That's real data arriving, not the row churning through half-built states.
   */
  const [warmStart] = useState(
    () => readCachedLibraryBooks(user) !== null && readCachedDiscoverItems() !== null,
  )
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
      setLibraryLoadedFromNetwork(true)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const [progressSynced, setProgressSynced] = useState(false)

  useEffect(() => {
    let cancelled = false
    void ensureCloudReadingProgressPulled(user).then(() => {
      if (cancelled) return
      setSyncVersion((n) => n + 1)
      setProgressSynced(true)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  // All three sources swallow their own errors, so they settle even offline — but a request
  // that never returns at all (a stalled mobile connection) would otherwise leave the row on
  // placeholders indefinitely. Past this point, show whatever has arrived: stale beats stuck.
  const [settleTimedOut, setSettleTimedOut] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSettleTimedOut(true), SETTLE_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [])

  const items = useMemo(() => {
    if (catalog.length === 0 && libraryBooks.length === 0) return []
    const recent = getRecentlyViewedProgress(user, RECENT_LOOKBACK_ITEMS)
    return buildContinueReadingItems(recent, catalog, libraryBooks, MAX_CONTINUE_READING_ITEMS)
    // `syncVersion` isn't read above -- it's a deliberate recompute trigger so this memo
    // reruns once cloud-synced progress has landed in localStorage (see the effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, libraryBooks, user, syncVersion])

  // Every source has answered. Until they all have, the row must not render what it has so
  // far: the three disagree about both membership and order while they land, and mobile shows
  // only two cards, so each partial answer visibly swapped a book out — catalog cache alone,
  // then the library listing displacing it, then cloud progress reordering the result.
  const resolved = warmStart || (libraryLoaded && catalogLoaded && progressSynced) || settleTimedOut

  // Record what the next visit should reserve. In an effect, not in render: this writes to
  // localStorage, and render runs twice under StrictMode.
  useEffect(() => {
    if (resolved) writeContinueReadingCount(user, items.length)
  }, [resolved, items.length, user])

  // Cache the listing only once the network has answered — seeding it from its own cache would
  // pin a deleted book forever. Covers ride along only for the books on the row, which is all
  // first paint needs and keeps a 450k data URL per book out of a ~5MB budget.
  useEffect(() => {
    if (!libraryLoadedFromNetwork) return
    const shownIds = new Set(
      items.flatMap((item) => (item.kind === "library" ? [item.book.id] : [])),
    )
    writeCachedLibraryBooks(user, libraryBooks, shownIds)
  }, [libraryLoadedFromNetwork, libraryBooks, items, user])

  // Still answering: hold placeholders rather than show a partial, unstable answer. With no
  // remembered count there is nothing to promise, so a first-ever visit falls through to the
  // fallback below rather than flashing placeholders at a reader who may have no history.
  if (!resolved && reservedCount === 0) return { mobileRow: null, desktopRow: fallback }

  if (!resolved) {
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
