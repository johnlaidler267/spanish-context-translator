import type { User } from "@supabase/supabase-js"
import type { ReconciledItem } from "@/lib/translate"

/**
 * Persists translated pages (the same `ReconciledItem[]` shape TranslationCache holds in
 * memory -- see translation-cache.ts) to localStorage, keyed by content, so reopening a
 * Discover item, a Library book, or an identical pasted text later can skip re-translating
 * pages that were already done in an earlier browser session.
 *
 * Same shape as reading-progress-storage.ts: scoped by user id (falling back to a shared
 * "guest" bucket pre-login) so cached pages don't bleed across accounts on a shared browser,
 * and best-effort throughout -- a quota error or private-mode localStorage just means the next
 * open re-translates, same as if nothing were cached.
 *
 * Every cached page is stamped with a hash of the exact source text it was translated from.
 * A lookup only counts as a hit when that hash still matches the page's current source text --
 * this is what keeps the cache safe if page-splitting ever produces different page boundaries
 * for the same content (e.g. a different viewport's article-page limits between sessions),
 * rather than silently showing a translation for the wrong text. There's no other invalidation:
 * Discover catalog items and uploaded EPUBs are static once created, so a content id (or a
 * pasted text's hash) is a stable cache key for as long as the content itself doesn't change.
 */
export const TRANSLATION_CACHE_STORAGE_KEY = "lector-translation-cache"

/**
 * Total serialized size kept per user scope. Translated book JSON can get big, and this shares
 * localStorage with reading-progress and the landing draft, so keep real headroom under the
 * ~5-10MB typical per-origin quota. When a write would push a scope over this, whole content
 * entries are evicted oldest-first (LRU by last-translated-page time) until it's back under.
 */
const MAX_CACHE_BYTES_PER_SCOPE = 3_000_000

interface CachedPage {
  textHash: string
  items: ReconciledItem[]
}

interface CachedContentEntry {
  pages: Record<number, CachedPage>
  updatedAt: number
}

type ScopedCache = Record<string, CachedContentEntry>
type AllCaches = Record<string, ScopedCache>

function scopeKeyFor(user: User | null): string {
  return user?.id ?? "guest"
}

/**
 * Small, fast, deterministic string hash (djb2) of a page's source text. This only needs to
 * catch "this cached page no longer matches the source text it was translated from" -- not
 * resist tampering -- so a cryptographic hash would be overkill. The length is folded in too,
 * mostly to cheaply separate texts that happen to hash-collide.
 */
function hashPageText(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36) + ":" + text.length
}

/**
 * Stable cache key for content with no catalog/library id -- a plain pasted/landing submission.
 * Hashes the full submitted text so re-pasting the exact same text hits the cache; anything
 * else (even a one-character edit) is treated as different content, which is the correct call
 * here -- there's no cheaper way to know whether an edited paste changed the same document or
 * became a different one.
 */
export function cacheKeyForPastedText(text: string): string {
  return `pasted:${hashPageText(text)}`
}

function readAll(): AllCaches {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as AllCaches) : {}
  } catch {
    return {}
  }
}

function writeAll(data: AllCaches): void {
  try {
    localStorage.setItem(TRANSLATION_CACHE_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota / private mode -- cache write is best-effort, nothing else depends on it landing */
  }
}

/** Evicts whole content entries (oldest `updatedAt` first) from `scoped` until its serialized
 *  size is back under budget. Mutates `scoped` in place. */
function evictUntilUnderBudget(scoped: ScopedCache): void {
  if (JSON.stringify(scoped).length <= MAX_CACHE_BYTES_PER_SCOPE) return
  const keysByAge = Object.keys(scoped).sort((a, b) => scoped[a]!.updatedAt - scoped[b]!.updatedAt)
  for (const key of keysByAge) {
    delete scoped[key]
    if (JSON.stringify(scoped).length <= MAX_CACHE_BYTES_PER_SCOPE) break
  }
}

/**
 * Returns the cached translation for `cacheKey`'s page `pageIndex` if one is stored AND its
 * stamped text hash still matches `pageText` -- null otherwise (never cached, evicted, or the
 * source text for that page no longer matches what was cached).
 */
export function getCachedTranslationPage(
  user: User | null,
  cacheKey: string,
  pageIndex: number,
  pageText: string,
): ReconciledItem[] | null {
  const scoped = readAll()[scopeKeyFor(user)]
  const page = scoped?.[cacheKey]?.pages[pageIndex]
  if (!page || page.textHash !== hashPageText(pageText)) return null
  return page.items
}

/**
 * Stores one translated page for `cacheKey`, stamped with a hash of the exact `pageText` it
 * came from (see getCachedTranslationPage). Evicts older content (LRU) first if the scope's
 * total size would otherwise exceed the cap.
 */
export function setCachedTranslationPage(
  user: User | null,
  cacheKey: string,
  pageIndex: number,
  pageText: string,
  items: ReconciledItem[],
): void {
  const all = readAll()
  const scope = scopeKeyFor(user)
  const scoped: ScopedCache = { ...(all[scope] ?? {}) }
  const existing = scoped[cacheKey]
  scoped[cacheKey] = {
    pages: { ...(existing?.pages ?? {}), [pageIndex]: { textHash: hashPageText(pageText), items } },
    updatedAt: Date.now(),
  }
  evictUntilUnderBudget(scoped)
  all[scope] = scoped
  writeAll(all)
}
