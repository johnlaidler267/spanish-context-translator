import { supabase } from "@/lib/supabase"
import { discoverRowToContentItem, type DiscoverListRow } from "@/lib/discover/discover-map"
import { getRecentlyViewedContentIdsAllScopes } from "@/lib/storage/reading-progress-storage"
import type { ContentItem, ContentType, DifficultyLevel } from "@/lib/discover/content-data"
import type { DiscoverItemInsert } from "@/lib/db-types"

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

/** Shape a curator's "publish this" form (dev-upload-resource-modal.tsx) hands over, whether the
 *  text was typed fresh or came from an existing My Library book (library/index.tsx). */
export type DiscoverResourcePublish = {
  title: string
  author: string
  language: string
  type: ContentType
  difficulty: DifficultyLevel
  text: string
  tags: string[]
  wordCount: number
  coverImage?: string
}

/**
 * Inserts one new row into `discover_items` from a curator's publish form and returns it mapped
 * back to a `ContentItem`, ready to splice into a catalog list. Shared by the Discover page's own
 * "Upload Resource" flow and the Library page's "Publish to Discover" flow (see
 * DevUploadResourceModal / library/index.tsx) -- same insert, same LIST_SELECT shape, so both
 * surfaces render the result identically without duplicating this mapping.
 *
 * Server-authoritative: RLS on `discover_items` only allows a `discover_curators` row to insert
 * (see supabase/migrations/0023_restore_discover_curators.sql), so this fails for anyone else
 * regardless of what a client shows.
 */
export async function publishDiscoverResource(
  resource: DiscoverResourcePublish,
): Promise<{ item: ContentItem } | { error: string }> {
  const estimatedMinutes = Math.max(1, Math.ceil(resource.wordCount / 200))
  const estimatedTime =
    estimatedMinutes >= 60 ? `${Math.ceil(estimatedMinutes / 60)} hours` : `${estimatedMinutes} min`
  const defaultTag = resource.type[0].toUpperCase() + resource.type.slice(1)
  const normalizedTags = resource.tags.length > 0 ? resource.tags : [defaultTag]
  const preview = resource.text.slice(0, 800)

  const insert: DiscoverItemInsert = {
    title: resource.title,
    author: resource.author,
    type: resource.type,
    difficulty: resource.difficulty,
    word_count: resource.wordCount,
    language: resource.language,
    cover_image:
      resource.coverImage ??
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop",
    tags: normalizedTags,
    preview,
    estimated_time: estimatedTime,
    body_text: resource.text,
  }

  const { data, error } = await supabase.from("discover_items").insert(insert).select(LIST_SELECT).single()
  if (error || !data) {
    return { error: error?.message ?? "Could not publish." }
  }
  return { item: discoverRowToContentItem(data as DiscoverListRow) }
}

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
