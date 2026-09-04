import type { User } from "@supabase/supabase-js"

/**
 * Per-user reading position for Discover content: "which article page (0-based) was this
 * reader last on for this piece of content". Scoped by user id (falls back to a shared
 * "guest" bucket pre-login) so one browser's progress doesn't bleed across accounts, and
 * kept in localStorage rather than a new Supabase table -- there's no cross-device sync
 * requirement here, just "reopen where I left off on this browser", which localStorage
 * already gives us for free.
 */
export const READING_PROGRESS_STORAGE_KEY = "lector-reading-progress"

/** Safety cap so a long history of opened content can't grow the stored blob unbounded. */
const MAX_TRACKED_ITEMS_PER_USER = 300

interface ProgressEntry {
  pageIndex: number
  updatedAt: number
  /** Page count the source split into when this position was saved -- omitted for older
   *  entries written before this field existed. Paging is viewport-dependent (see App.tsx),
   *  so this is only ever a rough "how far in" estimate, not an exact page count. */
  totalPages?: number
}

/** One recently-viewed item, newest first -- see `getRecentlyViewedProgress`. */
export interface RecentlyViewedEntry {
  contentId: string
  pageIndex: number
  totalPages?: number
  updatedAt: number
}

type UserProgressMap = Record<string, ProgressEntry>
type AllProgress = Record<string, UserProgressMap>

function scopeKeyFor(user: User | null): string {
  return user?.id ?? "guest"
}

function readAll(): AllProgress {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(READING_PROGRESS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as AllProgress) : {}
  } catch {
    return {}
  }
}

function writeAll(data: AllProgress): void {
  try {
    localStorage.setItem(READING_PROGRESS_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
}

/** 0-based article page index this reader last had open for `contentId`, or null if never started. */
export function getReadingProgress(user: User | null, contentId: string): number | null {
  const scoped = readAll()[scopeKeyFor(user)]
  const entry = scoped?.[contentId]
  return entry && Number.isFinite(entry.pageIndex) ? entry.pageIndex : null
}

export function hasReadingProgress(user: User | null, contentId: string): boolean {
  return getReadingProgress(user, contentId) != null
}

/**
 * Records `pageIndex` (0-based) as the last-read position for `contentId`. `totalPages`,
 * when given, is stored alongside it purely so a "X% through" indicator (landing page's
 * Continue Reading row) has something to divide by -- it's not used for resume logic.
 */
export function setReadingProgress(
  user: User | null,
  contentId: string,
  pageIndex: number,
  totalPages?: number,
): void {
  if (!Number.isFinite(pageIndex) || pageIndex < 0) return
  const all = readAll()
  const scope = scopeKeyFor(user)
  const scoped = { ...(all[scope] ?? {}) }
  scoped[contentId] = {
    pageIndex,
    updatedAt: Date.now(),
    ...(Number.isFinite(totalPages) && (totalPages as number) > 0 ? { totalPages } : {}),
  }

  const entries = Object.entries(scoped)
  if (entries.length > MAX_TRACKED_ITEMS_PER_USER) {
    // Drop the oldest first -- keeps the most recently-read items.
    entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    const overflow = entries.length - MAX_TRACKED_ITEMS_PER_USER
    for (let i = 0; i < overflow; i++) delete scoped[entries[i]![0]]
  }

  all[scope] = scoped
  writeAll(all)
}

/**
 * Up to `limit` most-recently-viewed Discover items for this user, newest first. Powers the
 * landing page's Continue Reading row -- the caller still has to match each `contentId`
 * against the Discover catalog itself (this module only knows ids and positions).
 */
export function getRecentlyViewedProgress(user: User | null, limit: number): RecentlyViewedEntry[] {
  const scoped = readAll()[scopeKeyFor(user)]
  if (!scoped) return []
  return Object.entries(scoped)
    .map(([contentId, entry]) => ({
      contentId,
      pageIndex: entry.pageIndex,
      totalPages: entry.totalPages,
      updatedAt: entry.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export function clearReadingProgress(user: User | null, contentId: string): void {
  const all = readAll()
  const scope = scopeKeyFor(user)
  const scoped = all[scope]
  if (!scoped || !(contentId in scoped)) return
  const next = { ...scoped }
  delete next[contentId]
  all[scope] = next
  writeAll(all)
}
