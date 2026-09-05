import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"
import type { ReconciledItem } from "@/lib/translate"

// TranslationCache's localStorage-backed L2 (see translation-cache-storage.ts) guards its reads
// with `typeof window === "undefined"`, so `window` needs stubbing too, not just `localStorage`.
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

describe("TranslationCache persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
    vi.resetModules()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("with no persist option behaves exactly as an in-memory-only cache (default unchanged)", async () => {
    const { TranslationCache } = await import("@/lib/translation-cache")
    const translateFn = vi.fn().mockResolvedValue(items("hola"))
    const cache = new TranslationCache()
    await cache.loadPage(0, "hola", translateFn)
    expect(translateFn).toHaveBeenCalledTimes(1)

    // A brand-new instance (e.g. the next `handleTextSubmit`) has nothing to fall back on.
    const fresh = new TranslationCache()
    const translateFn2 = vi.fn().mockResolvedValue(items("hola"))
    await fresh.loadPage(0, "hola", translateFn2)
    expect(translateFn2).toHaveBeenCalledTimes(1)
  })

  it("a page translated by one instance is picked up by a later instance for the same content, with no translate call", async () => {
    const { TranslationCache } = await import("@/lib/translation-cache")
    const persist = { user, cacheKey: "book-1" }

    const translateFn = vi.fn().mockResolvedValue(items("hola mundo"))
    const first = new TranslationCache(persist)
    const result1 = await first.loadPage(0, "hola mundo", translateFn)
    expect(translateFn).toHaveBeenCalledTimes(1)
    expect(result1).toEqual(items("hola mundo"))

    // Simulates navigating away and reopening the same content later -- a fresh in-memory
    // TranslationCache (as App.tsx's handleTextSubmit always creates), same persist key.
    const translateFnAgain = vi.fn().mockResolvedValue(items("should not be called"))
    const second = new TranslationCache(persist)
    const result2 = await second.loadPage(0, "hola mundo", translateFnAgain)
    expect(translateFnAgain).not.toHaveBeenCalled()
    expect(result2).toEqual(items("hola mundo"))
  })

  it("re-translates instead of reusing a stale cached page when the source text at that index changed", async () => {
    const { TranslationCache } = await import("@/lib/translation-cache")
    const persist = { user, cacheKey: "book-1" }

    const translateFn = vi.fn().mockResolvedValue(items("hola mundo"))
    const first = new TranslationCache(persist)
    await first.loadPage(0, "hola mundo", translateFn)

    // Different source text landed on page 0 this time (e.g. a different viewport's page
    // splitting) -- the persisted page's text hash won't match, so it must not be reused.
    const translateFn2 = vi.fn().mockResolvedValue(items("otro texto"))
    const second = new TranslationCache(persist)
    const result = await second.loadPage(0, "otro texto", translateFn2)
    expect(translateFn2).toHaveBeenCalledTimes(1)
    expect(result).toEqual(items("otro texto"))
  })

  it("keeps different content's persisted pages separate", async () => {
    const { TranslationCache } = await import("@/lib/translation-cache")

    const translateFnA = vi.fn().mockResolvedValue(items("libro A"))
    await new TranslationCache({ user, cacheKey: "book-A" }).loadPage(0, "texto A", translateFnA)

    const translateFnB = vi.fn().mockResolvedValue(items("libro B"))
    const result = await new TranslationCache({ user, cacheKey: "book-B" }).loadPage(
      0,
      "texto B",
      translateFnB,
    )
    expect(translateFnB).toHaveBeenCalledTimes(1)
    expect(result).toEqual(items("libro B"))
  })
})
