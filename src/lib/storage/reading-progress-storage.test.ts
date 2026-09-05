import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"

// Same `node`-env localStorage stub as reading-progress-sync.test.ts -- this module guards
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

describe("getReadingProgressPercent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
    vi.resetModules()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("is null when the book has never been opened", async () => {
    const { getReadingProgressPercent } = await import("@/lib/storage/reading-progress-storage")
    expect(getReadingProgressPercent(user, "book-1")).toBeNull()
  })

  it("is null when a position was saved but no page count was ever recorded", async () => {
    const { setReadingProgress, getReadingProgressPercent } = await import(
      "@/lib/storage/reading-progress-storage"
    )
    setReadingProgress(user, "book-1", 3)
    expect(getReadingProgressPercent(user, "book-1")).toBeNull()
  })

  it("rounds (pageIndex + 1) / totalPages to a whole percent", async () => {
    const { setReadingProgress, getReadingProgressPercent } = await import(
      "@/lib/storage/reading-progress-storage"
    )
    setReadingProgress(user, "book-1", 4, 10) // page 5 of 10 -> 50%
    expect(getReadingProgressPercent(user, "book-1")).toBe(50)
  })

  it("clamps to at least 1% so a just-started book never reads as 0%", async () => {
    const { setReadingProgress, getReadingProgressPercent } = await import(
      "@/lib/storage/reading-progress-storage"
    )
    setReadingProgress(user, "book-1", 0, 500)
    expect(getReadingProgressPercent(user, "book-1")).toBe(1)
  })

  it("caps at 100% even if pageIndex is clamped past the last page elsewhere", async () => {
    const { setReadingProgress, getReadingProgressPercent } = await import(
      "@/lib/storage/reading-progress-storage"
    )
    setReadingProgress(user, "book-1", 9, 10)
    expect(getReadingProgressPercent(user, "book-1")).toBe(100)
  })

  it("keeps each user's progress separate", async () => {
    const otherUser = { id: "user-2" } as User
    const { setReadingProgress, getReadingProgressPercent } = await import(
      "@/lib/storage/reading-progress-storage"
    )
    setReadingProgress(user, "book-1", 4, 10)
    expect(getReadingProgressPercent(otherUser, "book-1")).toBeNull()
  })
})
