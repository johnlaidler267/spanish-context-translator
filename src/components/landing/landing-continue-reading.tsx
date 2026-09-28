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
  readCachedLibraryCovers,
  writeCachedLibraryBooks,
} from "@/lib/storage/epub-library-cache"
import type { LibraryEpub } from "@/lib/storage/epub-library"
import {
  MAX_CONTINUE_READING_ITEMS,
  MAX_MOBILE_CONTINUE_READING_ITEMS,
  fetchSessionLibraryCovers,
  fetchSessionLibraryListing,
  readSessionLibraryCovers,
  readSessionLibraryListing,
} from "@/lib/storage/continue-reading-library"
import { getRecentlyViewedProgress } from "@/lib/storage/reading-progress-storage"
import { ensureCloudReadingProgressPulled } from "@/lib/storage/reading-progress-sync"
import { useViewport } from "@/contexts/viewport-context"
import type { ContentItem } from "@/lib/discover/content-data"

// MAX_CONTINUE_READING_ITEMS (4) keeps the desktop row from overflowing into a horizontal
// scrollbar -- see .continue-reading__row in index.css. MAX_MOBILE_CONTINUE_READING_ITEMS (2):
// mobile shows two reduced-height cards side by side (.continue-reading-mobile__row), the first
// two of the same recency-ordered list. Both live in continue-reading-library.ts because its
// pre-mount warm-up needs them to know which covers to fetch.

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

/**
 * A lone portrait card under the full-width composer reads as a stray tile, so a single item
 * switches the desktop row to a landscape "shelf" card instead (see
 * .continue-reading__row--solo in index.css). Applied to the placeholders too, keyed on the
 * reserved count, so a one-book reader doesn't see a portrait skeleton swap to landscape.
 */
function continueReadingRowClass(count: number) {
  return count === 1 ? "continue-reading__row continue-reading__row--solo" : "continue-reading__row"
}

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
  // This session's in-memory listing (continue-reading-library.ts) wins over the localStorage
  // copy: it came from the network moments ago -- usually the pre-mount warm-up in main.jsx,
  // which runs while the loading bar is still up. It's listed without covers (they're what
  // made the listing slow); those arrive separately into `covers`, for just the shown books.
  const [sessionLibrary] = useState(() => readSessionLibraryListing(user))
  const [libraryBooks, setLibraryBooks] = useState<LibraryEpub[]>(
    () => sessionLibrary ?? readCachedLibraryBooks(user) ?? [],
  )
  /** Known covers by book id (null = the book has none): the ones last visit cached, plus
   *  whatever this session has fetched. A shown book missing from here gets fetched below. */
  const [covers, setCovers] = useState<ReadonlyMap<string, string | null>>(() => {
    const known = readCachedLibraryCovers(user)
    for (const [id, cover] of readSessionLibraryCovers(user)) known.set(id, cover)
    return known
  })
  // The row can't know how many cards it will have until both sources have answered, so until
  // then it reserves however many it held last time (see continue-reading-count.ts). Either
  // half starts settled when its cache was warm enough to seed the state above.
  const [libraryLoaded, setLibraryLoaded] = useState(
    () => sessionLibrary !== null || readCachedLibraryBooks(user) !== null,
  )
  /** Distinct from `libraryLoaded`, which a warm cache satisfies — only the network refreshes the cache. */
  const [libraryLoadedFromNetwork, setLibraryLoadedFromNetwork] = useState(sessionLibrary !== null)
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
    () =>
      (sessionLibrary !== null || readCachedLibraryBooks(user) !== null) &&
      readCachedDiscoverItems() !== null,
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
    // Joins the pre-mount warm-up's request if it's still in flight (see main.jsx).
    void fetchSessionLibraryListing(user).then((books) => {
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

  const booksWithCovers = useMemo(
    () => libraryBooks.map((book) => ({ ...book, coverImage: covers.get(book.id) ?? book.coverImage })),
    [libraryBooks, covers],
  )

  const items = useMemo(() => {
    if (catalog.length === 0 && booksWithCovers.length === 0) return []
    const recent = getRecentlyViewedProgress(user, RECENT_LOOKBACK_ITEMS)
    return buildContinueReadingItems(recent, catalog, booksWithCovers, MAX_CONTINUE_READING_ITEMS)
    // `syncVersion` isn't read above -- it's a deliberate recompute trigger so this memo
    // reruns once cloud-synced progress has landed in localStorage (see the effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, booksWithCovers, user, syncVersion])

  // Covers for the library books this viewport actually shows and we don't have yet -- the
  // warm-up has usually fetched them already, in which case this joins or reuses its request.
  const visibleCount = isMobile ? MAX_MOBILE_CONTINUE_READING_ITEMS : MAX_CONTINUE_READING_ITEMS
  const missingCoverIds = items
    .slice(0, visibleCount)
    .flatMap((item) => (item.kind === "library" && !covers.has(item.book.id) ? [item.book.id] : []))
  const missingCoverKey = missingCoverIds.join(",")
  useEffect(() => {
    if (!missingCoverKey) return
    let cancelled = false
    void fetchSessionLibraryCovers(user, missingCoverKey.split(",")).then((fetched) => {
      if (cancelled) return
      setCovers((prev) => new Map([...prev, ...fetched]))
    })
    return () => {
      cancelled = true
    }
  }, [missingCoverKey, user])

  // Every source has answered. Until they all have, the row must not render what it has so
  // far: the three disagree about both membership and order while they land, and mobile shows
  // only two cards, so each partial answer visibly swapped a book out — catalog cache alone,
  // then the library listing displacing it, then cloud progress reordering the result.
  // Covers count too on a cold start, so a card doesn't land with its placeholder art and then
  // swap in the real cover a beat later. Not on a warm start: the cache normally carries the
  // row's covers, and when it couldn't (a full localStorage), a card showing placeholder art
  // for a moment beats holding the whole row on skeletons for the network.
  const ready =
    warmStart ||
    (libraryLoaded && catalogLoaded && progressSynced && missingCoverIds.length === 0) ||
    settleTimedOut
  // Latched: once shown, a book arriving later (e.g. from cloud progress) whose cover isn't in
  // yet must not flip the whole row back to placeholders.
  const [everReady, setEverReady] = useState(false)
  if (ready && !everReady) setEverReady(true)
  const resolved = ready || everReady

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
    writeCachedLibraryBooks(user, libraryBooks, covers, shownIds)
  }, [libraryLoadedFromNetwork, libraryBooks, covers, items, user])

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
            <div className="continue-reading-mobile w-full order-1" aria-busy="true">
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
              className="continue-reading w-full order-3 md:order-3 mt-0 md:mt-1"
              aria-busy="true"
            >
              <p className="sample-excerpt-label text-center">Continue reading</p>
              <div className={continueReadingRowClass(reservedCount)}>
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
      // No "Continue reading" label on mobile: it stacked a second line of small caps right
      // under the greeting, and the row only ever holds the reader's own recently-opened books,
      // which they recognize on sight -- the progress bar and the percentage beside the author
      // (see .continue-reading-mobile__row in index.css) say "in progress" without a heading.
      // Caller renders this as a sibling of the filigree divider and composer form, inside
      // their shared flex wrapper (see landing-screen.tsx) -- order-1 puts it above the divider
      // (order-2), which then separates it from the composer (order-3).
      mobileRow: (
        <div className="continue-reading-mobile w-full order-1">
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
      <div className="continue-reading w-full order-3 md:order-3 mt-0 md:mt-1">
        <p className="sample-excerpt-label text-center">Continue reading</p>
        <div className={continueReadingRowClass(items.length)}>
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
