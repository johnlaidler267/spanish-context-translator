import type { User } from "@supabase/supabase-js"

/**
 * How many cards the landing page's Continue Reading row held last time it resolved, per user.
 *
 * The row's data arrives from `listUserEpubs` (an uncached network read) and the Discover
 * catalog, so on a refresh it renders empty and then pushes the page down when the cards land —
 * a ~0.11 layout shift on mobile. Remembering the count lets the row reserve the right amount of
 * space on first paint, so the real cards drop into a box that is already the right size.
 *
 * Only the count is stored, never the content: a stale title or cover would be a visible lie,
 * whereas a stale count is at worst a placeholder that resolves to a different number of cards.
 */
const STORAGE_KEY = "lexa.continueReadingCount.v1"

/** Matches `scopeKeyFor` in reading-progress-storage.ts so both keep the same guest bucket. */
function scopeKeyFor(user: User | null): string {
  return user?.id ?? "guest"
}

function readAll(): Record<string, number> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function readContinueReadingCount(user: User | null): number {
  const value = readAll()[scopeKeyFor(user)]
  return typeof value === "number" && value > 0 ? value : 0
}

export function writeContinueReadingCount(user: User | null, count: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [scopeKeyFor(user)]: count }))
  } catch {
    /* quota / private mode */
  }
}
