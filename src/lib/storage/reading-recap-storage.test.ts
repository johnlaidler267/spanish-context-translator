import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"

// Same `node`-env localStorage stub as reading-progress-storage.test.ts -- this module guards
// every read with `typeof window === "undefined"`, so `window` needs stubbing too.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
}

const user = { id: "user-1" } as User

describe("reading-recap-storage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
    vi.resetModules()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("is null when nothing has ever been cached for this book", async () => {
    const { getCachedPageRecap } = await import("@/lib/storage/reading-recap-storage")
    expect(getCachedPageRecap(user, "book-1", 2)).toBeNull()
  })

  it("returns the cached summary when it matches the expected previous-page index", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "A duck learns to swim.")
    expect(getCachedPageRecap(user, "book-1", 2)).toBe("A duck learns to swim.")
  })

  it("treats a cached summary as stale (returns null) if the expected page moved on", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "A duck learns to swim.")
    // Progress synced from elsewhere moved the resume point further -- page 2 is no longer
    // "the page right before where we're resuming to".
    expect(getCachedPageRecap(user, "book-1", 5)).toBeNull()
  })

  it("ignores a blank summary", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "   ")
    expect(getCachedPageRecap(user, "book-1", 2)).toBeNull()
  })

  it("keeps each user's cache separate", async () => {
    const otherUser = { id: "user-2" } as User
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "A duck learns to swim.")
    expect(getCachedPageRecap(otherUser, "book-1", 2)).toBeNull()
  })

  it("overwrites an older cached recap for the same book with a newer one", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "First summary.")
    setCachedPageRecap(user, "book-1", 6, "Second summary.")
    expect(getCachedPageRecap(user, "book-1", 2)).toBeNull()
    expect(getCachedPageRecap(user, "book-1", 6)).toBe("Second summary.")
  })

  // Root cause of the mobile-vs-desktop bug: mobile and desktop paginate the same book
  // differently, so "leave off at page N" means a different raw page index on each device.
  // The sentence-index anchor is device-independent and takes priority over the raw page index
  // whenever both are available, so a recap generated on desktop still matches on reopen from
  // mobile even though the two devices disagree about which page number that is.
  it("matches by sentence-index anchor even when the raw page index differs across devices", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    // Cached while leaving on desktop: desktop's own page 2, sentence anchor 40.
    setCachedPageRecap(user, "book-1", 2, "A duck learns to swim.", 40)
    // Reopened on mobile: mobile's own page-split puts the same spot at page 5, not 2 -- but
    // the sentence anchor still lines up, so the summary should still be found.
    expect(getCachedPageRecap(user, "book-1", 5, 40)).toBe("A duck learns to swim.")
  })

  it("still treats it as stale when the sentence-index anchor itself has moved on", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "A duck learns to swim.", 40)
    expect(getCachedPageRecap(user, "book-1", 2, 99)).toBeNull()
  })

  it("falls back to the raw page-index match when no sentence anchor is available on either side", async () => {
    const { setCachedPageRecap, getCachedPageRecap } = await import(
      "@/lib/storage/reading-recap-storage"
    )
    setCachedPageRecap(user, "book-1", 2, "A duck learns to swim.")
    expect(getCachedPageRecap(user, "book-1", 2, null)).toBe("A duck learns to swim.")
  })
})
