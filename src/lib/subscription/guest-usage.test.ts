import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  GUEST_LIMIT,
  getGuestUses,
  incrementGuestUses,
  hasReachedGuestLimit,
  clearGuestUses,
} from "@/lib/subscription/guest-usage"

// The vitest env here is `node` (no jsdom / localStorage). Stub a minimal
// in-memory implementation so this gate -- how many free translations a
// signed-out visitor gets before being asked to sign up -- is covered.
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

describe("guest usage tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeMemoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("starts at 0 uses with no stored state", () => {
    expect(getGuestUses()).toBe(0)
    expect(hasReachedGuestLimit()).toBe(false)
  })

  it("increments and persists the count", () => {
    expect(incrementGuestUses()).toBe(1)
    expect(incrementGuestUses()).toBe(2)
    expect(getGuestUses()).toBe(2)
  })

  it("reaches the limit at exactly GUEST_LIMIT uses", () => {
    for (let i = 0; i < GUEST_LIMIT - 1; i++) incrementGuestUses()
    expect(hasReachedGuestLimit()).toBe(false)
    incrementGuestUses()
    expect(getGuestUses()).toBe(GUEST_LIMIT)
    expect(hasReachedGuestLimit()).toBe(true)
  })

  it("clearGuestUses resets the counter (e.g. on sign-in)", () => {
    incrementGuestUses()
    incrementGuestUses()
    clearGuestUses()
    expect(getGuestUses()).toBe(0)
  })

  it("migrates the legacy storage key once, then removes it", () => {
    localStorage.setItem("lector_guest_uses", "2")
    expect(getGuestUses()).toBe(2)
    // Migrated into the new key and the legacy key is gone.
    expect(localStorage.getItem("guest_tries_used")).toBe("2")
    expect(localStorage.getItem("lector_guest_uses")).toBeNull()
  })

  it("prefers the new key over the legacy key when both are present", () => {
    localStorage.setItem("guest_tries_used", "3")
    localStorage.setItem("lector_guest_uses", "99")
    expect(getGuestUses()).toBe(3)
  })

  it("does not throw when storage access fails (e.g. private browsing)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      },
    })
    expect(() => getGuestUses()).not.toThrow()
    expect(getGuestUses()).toBe(0)
    expect(() => incrementGuestUses()).not.toThrow()
    expect(() => clearGuestUses()).not.toThrow()
  })
})
