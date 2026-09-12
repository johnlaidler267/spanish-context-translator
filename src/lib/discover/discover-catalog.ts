import { supabase } from "@/lib/supabase"
import { discoverRowToContentItem, type DiscoverListRow } from "@/lib/discover/discover-map"
import { getRecentlyViewedContentIdsAllScopes } from "@/lib/storage/reading-progress-storage"
import type { ContentItem } from "@/lib/discover/content-data"

const LIST_SELECT =
  "id, title, author, type, difficulty, word_count, language, cover_image, tags, preview, estimated_time, created_at"

// Bumped to v2: cached rows now carry `preview` — v1 entries would open the modal blank.
// localStorage (not sessionStorage): the catalog rarely changes day to day, so a fresh
// visit should paint instantly from whatever was cached last time, not show a loading
// state again just because it's a new tab/session. The list is still re-fetched in the
// background on every Discover-page visit (and by the landing-page prefetch below) and
// the cache updated, so new content still shows up -- just without blocking first paint.
const DISCOVER_CACHE_KEY = "lexa.discover.catalog.v2"

export function readCachedDiscoverItems(): ContentItem[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(DISCOVER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ContentItem[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeCachedDiscoverItems(items: ContentItem[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify(items))
  } catch {
    /* ignore quota/private mode */
  }
}

export type DiscoverCatalogResult = { items: ContentItem[] } | { error: string }

let inFlight: Promise<DiscoverCatalogResult> | null = null

/**
 * Fetches the full Discover catalog from `discover_items` and refreshes the shared
 * localStorage cache (`readCachedDiscoverItems` / `DISCOVER_CACHE_KEY`). This is the
 * single fetch path for Discover content -- both the Discover page's own on-mount load
 * and the landing-page background prefetch (see App.tsx) call this exact function, so
 * they share one cache entry and, if they ever overlap in time, one in-flight request:
 * a caller that arrives while a fetch is already running gets the same pending promise
 * back instead of firing a duplicate network call.
 */
export function fetchDiscoverCatalog(): Promise<DiscoverCatalogResult> {
  if (inFlight) return inFlight
  const promise: Promise<DiscoverCatalogResult> = (async () => {
    const { data, error } = await supabase
      .from("discover_items")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
    if (error) return { error: error.message }
    const rows = (data ?? []) as DiscoverListRow[]
    const items = rows.map(discoverRowToContentItem)
    writeCachedDiscoverItems(items)
    return { items }
  })().finally(() => {
    inFlight = null
  })
  inFlight = promise
  return promise
}

/**
 * How many covers to warm from the top of the catalog -- roughly the first Discover screen
 * on a phone. Deliberately not the whole catalog: every entry here is a real image request,
 * so warming everything would trade one visible stall for a burst of competing ones.
 */
const WARM_COVER_COUNT = 12

/** How far back to look for Continue Reading's covers. Matches the row's own lookback. */
const WARM_RECENT_COUNT = 6

/** URLs already handed to the browser this session -- an <img> per call would be wasteful. */
const warmedCoverUrls = new Set<string>()

/**
 * Hands a set of cover URLs to the browser's own image cache ahead of render, so the card
 * that eventually mounts paints its cover in the same frame as its title instead of a beat
 * later. Intentionally uses the plain HTTP image cache rather than storing image bytes
 * ourselves: covers are public catalog art on a CDN with its own cache headers, and copying
 * them into localStorage would mean a quota-bounded, hand-invalidated second copy of data the
 * browser already caches correctly.
 *
 * Best-effort by construction -- a failed or blocked request just means the card loads its
 * cover the old way.
 */
export function preloadDiscoverCovers(items: ContentItem[]) {
  if (typeof window === "undefined" || typeof Image === "undefined") return
  for (const item of items) {
    const url = item.coverImage?.trim()
    if (!url || warmedCoverUrls.has(url)) continue
    warmedCoverUrls.add(url)
    try {
      const img = new Image()
      img.decoding = "async"
      // No crossOrigin / referrerPolicy / sizes here on purpose: the browser keys its image
      // cache on the request's CORS mode as well as its URL, so anything the card's own plain
      // <img> doesn't set would warm a *different* cache entry and warm nothing useful.
      img.src = url
    } catch {
      /* no-op: the card's own <img> is still the real load */
    }
  }
}

/** The catalog entries whose covers are worth warming: the first Discover screen, plus
 *  whatever Continue Reading is about to show. */
function coversWorthWarming(items: ContentItem[]): ContentItem[] {
  const recentIds = new Set(getRecentlyViewedContentIdsAllScopes(WARM_RECENT_COUNT))
  const picked = new Map<string, ContentItem>()
  for (const item of items) {
    if (recentIds.has(item.id)) picked.set(item.id, item)
  }
  for (const item of items.slice(0, WARM_COVER_COUNT)) picked.set(item.id, item)
  return [...picked.values()]
}

/**
 * The single first-paint warm-up both catalog-backed surfaces rely on -- the landing page's
 * Continue Reading row and the Discover page. Call it as early as the bundle allows (see
 * src/main.jsx), *before* React has mounted anything.
 *
 * The problem it solves: both surfaces used to start their catalog fetch from a component
 * mount effect, so the network round trip ran strictly *after* the bundle had parsed, auth had
 * resolved and React had rendered -- which is why a cold cache showed the landing page without
 * its Continue Reading row (and Discover with its skeleton) for a beat, and why mobile, where
 * every one of those steps is slower, saw it every time while desktop mostly didn't. Starting
 * here overlaps the fetch with React's boot instead of queueing it behind.
 *
 * This is not a second cache: it calls the same `fetchDiscoverCatalog()` both surfaces already
 * call, so all three share one localStorage entry and one in-flight request. The covers are
 * warmed from the cached list immediately (so a returning visitor's images are already in
 * flight before any component exists) and again from the fresh list, since a background
 * refresh can introduce covers the cache didn't know about.
 */
export function warmDiscoverFirstPaint() {
  if (typeof window === "undefined") return
  const cached = readCachedDiscoverItems()
  if (cached) preloadDiscoverCovers(coversWorthWarming(cached))
  void fetchDiscoverCatalog().then((result) => {
    if ("items" in result) preloadDiscoverCovers(coversWorthWarming(result.items))
  })
}
