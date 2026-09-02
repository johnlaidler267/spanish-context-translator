import { supabase } from "@/lib/supabase"
import { discoverRowToContentItem, type DiscoverListRow } from "@/lib/discover/discover-map"
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
