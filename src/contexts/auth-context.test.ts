import { describe, it, expect, afterEach, vi } from "vitest"
import {
  isAuthCallbackInUrl,
  currentPageRedirectUrl,
  clearAuthCallbackParamsFromUrl,
} from "@/contexts/auth-context"

// "Logging in…" should only show while an actual sign-in is completing (OAuth/magic-link
// callback), never on a plain refresh of an already-established session -- see App.tsx's use
// of isSigningIn. This is the synchronous, pre-any-auth-event signal that seeds that state.

function stubLocation(url: string) {
  const { search, hash } = new URL(url, "https://example.com")
  vi.stubGlobal("window", { location: { search, hash } })
}

function stubFullLocation(url: string) {
  const { origin, pathname, search, hash } = new URL(url, "https://example.com")
  vi.stubGlobal("window", { location: { origin, pathname, search, hash } })
}

describe("isAuthCallbackInUrl", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("is false on a plain page load with no auth params", () => {
    stubLocation("https://example.com/")
    expect(isAuthCallbackInUrl()).toBe(false)
  })

  it("is false for ordinary query params unrelated to auth", () => {
    stubLocation("https://example.com/?tab=billing")
    expect(isAuthCallbackInUrl()).toBe(false)
  })

  it("is true for a PKCE OAuth/magic-link callback ('?code=...')", () => {
    stubLocation("https://example.com/?code=abc123")
    expect(isAuthCallbackInUrl()).toBe(true)
  })

  it("is true for a failed OAuth attempt ('?error=...')", () => {
    stubLocation("https://example.com/?error=access_denied&error_description=User+denied")
    expect(isAuthCallbackInUrl()).toBe(true)
  })

  it("is true for an implicit-flow callback ('#access_token=...')", () => {
    stubLocation("https://example.com/#access_token=xyz&token_type=bearer")
    expect(isAuthCallbackInUrl()).toBe(true)
  })

  it("is false when window is unavailable (SSR-safe)", () => {
    vi.stubGlobal("window", undefined)
    expect(isAuthCallbackInUrl()).toBe(false)
  })
})

// If a stale `?code=...` (or `#access_token=...`) is still in the address bar when the tab is
// reloaded or restored, GoTrue tries to redeem it again, that redemption fails (PKCE codes are
// single-use), and — this is the actual bug — that failure short-circuits session restore
// before it ever falls back to the still-valid session already sitting in localStorage. The
// user reads as signed out even though their token was never touched. auth-context.tsx calls
// clearAuthCallbackParamsFromUrl() once the callback's first auth event lands specifically to
// prevent that: strip the params so a later reload/restore never re-presents them.
describe("clearAuthCallbackParamsFromUrl", () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubLocationAndHistory(url: string) {
    const replaceState = vi.fn()
    const parsed = new URL(url, "https://example.com")
    vi.stubGlobal("window", {
      location: { href: parsed.toString() },
      history: { replaceState, state: { idx: 0 } },
    })
    return replaceState
  }

  it("strips 'code' and 'state' from a PKCE callback URL", () => {
    const replaceState = stubLocationAndHistory("https://example.com/upgrade?code=abc&state=xyz")
    clearAuthCallbackParamsFromUrl()
    expect(replaceState).toHaveBeenCalledTimes(1)
    const [state, , newUrl] = replaceState.mock.calls[0] as [unknown, string, string]
    expect(state).toEqual({ idx: 0 })
    expect(new URL(newUrl).search).toBe("")
    expect(new URL(newUrl).pathname).toBe("/upgrade")
  })

  it("strips 'error'/'error_description' from a failed OAuth attempt", () => {
    const replaceState = stubLocationAndHistory(
      "https://example.com/?error=access_denied&error_description=User+denied",
    )
    clearAuthCallbackParamsFromUrl()
    expect(new URL(replaceState.mock.calls[0][2] as string).search).toBe("")
  })

  it("clears an implicit-flow '#access_token=...' hash", () => {
    const replaceState = stubLocationAndHistory("https://example.com/#access_token=xyz&token_type=bearer")
    clearAuthCallbackParamsFromUrl()
    expect(new URL(replaceState.mock.calls[0][2] as string).hash).toBe("")
  })

  it("preserves unrelated query params (e.g. a pending checkout return)", () => {
    const replaceState = stubLocationAndHistory(
      "https://example.com/upgrade?checkout=success&code=abc",
    )
    clearAuthCallbackParamsFromUrl()
    const newUrl = new URL(replaceState.mock.calls[0][2] as string)
    expect(newUrl.searchParams.get("checkout")).toBe("success")
    expect(newUrl.searchParams.has("code")).toBe(false)
  })

  it("does nothing when the URL has no auth callback params", () => {
    const replaceState = stubLocationAndHistory("https://example.com/upgrade?checkout=success")
    clearAuthCallbackParamsFromUrl()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it("is a no-op instead of throwing when window/history is unavailable (SSR-safe)", () => {
    vi.stubGlobal("window", undefined)
    expect(() => clearAuthCallbackParamsFromUrl()).not.toThrow()
  })
})

// Free users forced into sign-in mid-checkout (from /upgrade) must land back on /upgrade
// after OAuth/magic-link completes, not on the home page — see signInWithOAuth and
// signInWithMagicLink in auth-context.tsx, which both build their redirect from this.
describe("currentPageRedirectUrl", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("preserves the current path so checkout isn't lost on sign-in from /upgrade", () => {
    stubFullLocation("https://example.com/upgrade")
    expect(currentPageRedirectUrl()).toBe("https://example.com/upgrade")
  })

  it("preserves query params (e.g. a pending Stripe checkout return)", () => {
    stubFullLocation("https://example.com/upgrade?checkout=success&session_id=cs_test_123")
    expect(currentPageRedirectUrl()).toBe(
      "https://example.com/upgrade?checkout=success&session_id=cs_test_123",
    )
  })

  it("resolves to just the origin on the home page, same as before", () => {
    stubFullLocation("https://example.com/")
    expect(currentPageRedirectUrl()).toBe("https://example.com/")
  })
})
