import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"
import type { ReconciledItem } from "@/lib/translate"

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
const items = (label: string): ReconciledItem[] =>
  [{ type: "text", source: label, translation: label } as unknown as ReconciledItem]

describe("translation-cache-storage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
    vi.resetModules()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("is a miss when nothing was ever cached", async () => {
    const { getCachedTranslationPage } = await import("@/lib/storage/translation-cache-storage")
    expect(getCachedTranslationPage(user, "book-1", 0, "hola")).toBeNull()
  })

  it("round-trips a cached page for the exact same source text", async () => {
    const { getCachedTranslationPage, setCachedTranslationPage } = await import(
      "@/lib/storage/translation-cache-storage"
    )
    setCachedTranslationPage(user, "book-1", 0, "hola mundo", items("hola mundo"))
    expect(getCachedTranslationPage(user, "book-1", 0, "hola mundo")).toEqual(
      items("hola mundo"),
    )
  })

  it("misses if the source text at that page index changed (e.g. different page-split boundary)", async () => {
    const { getCachedTranslationPage, setCachedTranslationPage } = await import(
      "@/lib/storage/translation-cache-storage"
    )
    setCachedTranslationPage(user, "book-1", 0, "hola mundo", items("hola mundo"))
    expect(getCachedTranslationPage(user, "book-1", 0, "adios mundo")).toBeNull()
  })

  it("keeps each user's cache separate", async () => {
    const otherUser = { id: "user-2" } as User
    const { getCachedTranslationPage, setCachedTranslationPage } = await import(
      "@/lib/storage/translation-cache-storage"
    )
    setCachedTranslationPage(user, "book-1", 0, "hola", items("hola"))
    expect(getCachedTranslationPage(otherUser, "book-1", 0, "hola")).toBeNull()
  })

  it("keeps each content key's pages separate", async () => {
    const { getCachedTranslationPage, setCachedTranslationPage } = await import(
      "@/lib/storage/translation-cache-storage"
    )
    setCachedTranslationPage(user, "book-1", 0, "hola", items("hola"))
    setCachedTranslationPage(user, "book-2", 0, "adios", items("adios"))
    expect(getCachedTranslationPage(user, "book-1", 0, "hola")).toEqual(items("hola"))
    expect(getCachedTranslationPage(user, "book-2", 0, "adios")).toEqual(items("adios"))
  })

  it("evicts the least-recently-touched content first once the scope exceeds its byte budget", async () => {
    const { getCachedTranslationPage, setCachedTranslationPage } = await import(
      "@/lib/storage/translation-cache-storage"
    )
    // Each page's text/items are padded to a large enough size that four of them blow past the
    // module's ~3MB-per-scope cap without needing an unreasonably large test fixture.
    const big = (label: string) => label.repeat(400_000)
    setCachedTranslationPage(user, "old-book", 0, big("a"), items(big("a")))
    setCachedTranslationPage(user, "new-book", 0, big("b"), items(big("b")))
    setCachedTranslationPage(user, "newer-book", 0, big("c"), items(big("c")))
    setCachedTranslationPage(user, "newest-book", 0, big("d"), items(big("d")))

    // The oldest entry should have been evicted to make room...
    expect(getCachedTranslationPage(user, "old-book", 0, big("a"))).toBeNull()
    // ...while the most recently written one survives.
    expect(getCachedTranslationPage(user, "newest-book", 0, big("d"))).toEqual(items(big("d")))
  })

  it("produces the same pasted-text cache key for identical text and a different one otherwise", async () => {
    const { cacheKeyForPastedText } = await import("@/lib/storage/translation-cache-storage")
    expect(cacheKeyForPastedText("hola mundo")).toBe(cacheKeyForPastedText("hola mundo"))
    expect(cacheKeyForPastedText("hola mundo")).not.toBe(cacheKeyForPastedText("adios mundo"))
  })
})
