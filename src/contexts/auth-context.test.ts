import { describe, it, expect, afterEach, vi } from "vitest"
import { isAuthCallbackInUrl, currentPageRedirectUrl } from "@/contexts/auth-context"

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
