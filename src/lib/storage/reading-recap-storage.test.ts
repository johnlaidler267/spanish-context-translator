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
})
