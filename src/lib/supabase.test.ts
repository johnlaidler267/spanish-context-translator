import { describe, it, expect, afterEach, vi } from "vitest"
import { getCachedSupabaseUser } from "@/lib/supabase"

// getCachedSupabaseUser lets AuthProvider seed its very first render from whatever session
// supabase-js already persisted to localStorage, instead of always starting "signed out" and
// flipping once the real (async) session restore lands — see auth-context.tsx. VITE_SUPABASE_URL
// is the dummy "https://example.supabase.co" set in vite.config.js's test env, so supabase-js's
// default storage key here is "sb-example-auth-token" (hostname's first label + "-auth-token").
const STORAGE_KEY = "sb-example-auth-token"

function stubWindowWithStorage(store: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    },
  })
}

describe("getCachedSupabaseUser", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("returns null when no session is stored", () => {
    stubWindowWithStorage({})
    expect(getCachedSupabaseUser()).toBeNull()
  })

  it("returns the persisted user from a session stored under supabase-js's default key", () => {
    const user = { id: "u1", email: "returning@example.com", is_anonymous: false }
    stubWindowWithStorage({
      [STORAGE_KEY]: JSON.stringify({ access_token: "t", refresh_token: "r", user }),
    })
    expect(getCachedSupabaseUser()).toEqual(user)
  })

  it("returns null instead of throwing on a corrupt stored value", () => {
    stubWindowWithStorage({ [STORAGE_KEY]: "{not json" })
    expect(getCachedSupabaseUser()).toBeNull()
  })

  it("returns null when the stored session has no user field", () => {
    stubWindowWithStorage({ [STORAGE_KEY]: JSON.stringify({ access_token: "t" }) })
    expect(getCachedSupabaseUser()).toBeNull()
  })

  it("returns null instead of throwing when localStorage access itself throws (e.g. private browsing)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError")
        },
      },
    })
    expect(getCachedSupabaseUser()).toBeNull()
  })

  it("is SSR-safe: returns null when window is unavailable", () => {
    vi.stubGlobal("window", undefined)
    expect(getCachedSupabaseUser()).toBeNull()
  })
})
