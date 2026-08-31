import { describe, it, expect, afterEach, vi } from "vitest"
import {
  CheckoutError,
  CHECKOUT_IDENTITY_REQUIRED_CODE,
  isIdentityRequiredCheckoutError,
  needsAuthBeforeBilling,
  checkoutErrorFromInvoke,
  didReturnFromCheckout,
  getReturnedCheckoutSessionId,
  clearCheckoutParam,
} from "@/lib/subscription/checkout"

// ─── needsAuthBeforeBilling ──────────────────────────────────────────────────
// The client-side guard in front of every billing action (subscribe,
// reactivate, cancel, downgrade, manage billing) in upgrade.tsx. One of its
// four call sites had this exact check too narrow (only `is_anonymous`, not
// "no user at all") and showed a raw error banner instead of the sign-in
// modal for a fully signed-out visitor -- this is the shared fix, used by
// all four now.

describe("needsAuthBeforeBilling", () => {
  it("is true when there is no user at all (fully signed out)", () => {
    expect(needsAuthBeforeBilling(null)).toBe(true)
    expect(needsAuthBeforeBilling(undefined)).toBe(true)
  })

  it("is true for a guest/anonymous session", () => {
    expect(needsAuthBeforeBilling({ is_anonymous: true })).toBe(true)
  })

  it("is false for a real signed-in user", () => {
    expect(needsAuthBeforeBilling({ is_anonymous: false })).toBe(false)
    expect(needsAuthBeforeBilling({})).toBe(false)
  })
})

// ─── isIdentityRequiredCheckoutError ────────────────────────────────────────
// This is the exact check that decides "show sign-in modal" vs "show a raw
// error banner" on /upgrade — narrow it and the sign-in prompt silently
// stops appearing for the server-side identity-required case.

describe("isIdentityRequiredCheckoutError", () => {
  it("is true for a CheckoutError carrying the identity_required code", () => {
    const e = new CheckoutError("nope", 403, CHECKOUT_IDENTITY_REQUIRED_CODE)
    expect(isIdentityRequiredCheckoutError(e)).toBe(true)
  })

  it("is false for a CheckoutError with a different code", () => {
    const e = new CheckoutError("nope", 403, "some_other_code")
    expect(isIdentityRequiredCheckoutError(e)).toBe(false)
  })

  it("is false for a CheckoutError with no code at all (e.g. the generic no-session error)", () => {
    const e = new CheckoutError("You must be signed in to subscribe.", 401)
    expect(isIdentityRequiredCheckoutError(e)).toBe(false)
  })

  it("is false for a non-CheckoutError value", () => {
    expect(isIdentityRequiredCheckoutError(new Error("boom"))).toBe(false)
    expect(isIdentityRequiredCheckoutError("boom")).toBe(false)
    expect(isIdentityRequiredCheckoutError(null)).toBe(false)
    expect(isIdentityRequiredCheckoutError(undefined)).toBe(false)
  })
})

// ─── checkoutErrorFromInvoke ─────────────────────────────────────────────────
// Turns a Supabase functions.invoke() failure into the CheckoutError the user
// actually sees. This is the one place that decides whether a checkout
// failure shows a useful message or a generic "request failed".

/** supabase-js throws a real Error with a `.context` Response attached (FunctionsHttpError-shaped). */
function fakeInvokeError(message: string, context?: Response): Error {
  return Object.assign(new Error(message), context ? { context } : {})
}

describe("checkoutErrorFromInvoke", () => {
  it("falls back to a generic message when there's no Response context", async () => {
    const err = await checkoutErrorFromInvoke(new Error("network down"))
    expect(err).toBeInstanceOf(CheckoutError)
    expect(err.message).toBe("network down")
    expect(err.status).toBeUndefined()
  })

  it("uses a placeholder message when the failure isn't even an Error", async () => {
    const err = await checkoutErrorFromInvoke("just a string")
    expect(err.message).toBe("Edge function request failed")
  })

  it("parses {error} from the Response body and preserves status + code", async () => {
    const ctx = new Response(JSON.stringify({ error: "Card declined", code: "card_declined" }), {
      status: 402,
    })
    const err = await checkoutErrorFromInvoke(
      fakeInvokeError("Edge Function returned a non-2xx status code", ctx),
    )
    expect(err.message).toBe("Card declined")
    expect(err.status).toBe(402)
    expect(err.code).toBe("card_declined")
  })

  it("falls back to {message} when the body has no {error} key", async () => {
    const ctx = new Response(JSON.stringify({ message: "Something broke" }), { status: 500 })
    const err = await checkoutErrorFromInvoke(fakeInvokeError("generic", ctx))
    expect(err.message).toBe("Something broke")
  })

  it("includes the HTTP status and a hint when the body is empty", async () => {
    const ctx = new Response("", { status: 500 })
    const err = await checkoutErrorFromInvoke(fakeInvokeError("generic failure", ctx))
    expect(err.message).toContain("generic failure")
    expect(err.message).toContain("HTTP 500")
    expect(err.status).toBe(500)
  })

  it("falls back to the raw body text (truncated) when it isn't valid JSON", async () => {
    const raw = "<html>502 Bad Gateway</html>"
    const ctx = new Response(raw, { status: 502 })
    const err = await checkoutErrorFromInvoke(fakeInvokeError("generic", ctx))
    expect(err.message).toBe(raw)
    expect(err.status).toBe(502)
  })

  it("truncates a very long non-JSON body to 500 chars", async () => {
    const raw = "x".repeat(1000)
    const ctx = new Response(raw, { status: 500 })
    const err = await checkoutErrorFromInvoke(fakeInvokeError("generic", ctx))
    expect(err.message).toHaveLength(500)
  })
})

// ─── URL param helpers ────────────────────────────────────────────────────────
// These read/write window.location + history directly. The vitest env here is
// `node` (no jsdom), so stub a minimal `window` per test rather than pulling
// in a DOM library for three small helpers.

describe("checkout return-from-Stripe URL helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("didReturnFromCheckout is true when ?checkout=success is present", () => {
    vi.stubGlobal("window", {
      location: { search: "?checkout=success&session_id=cs_test_123" },
    })
    expect(didReturnFromCheckout()).toBe(true)
  })

  it("didReturnFromCheckout is false otherwise", () => {
    vi.stubGlobal("window", { location: { search: "" } })
    expect(didReturnFromCheckout()).toBe(false)
  })

  it("getReturnedCheckoutSessionId reads session_id from the query string", () => {
    vi.stubGlobal("window", {
      location: { search: "?checkout=success&session_id=cs_test_123" },
    })
    expect(getReturnedCheckoutSessionId()).toBe("cs_test_123")
  })

  it("getReturnedCheckoutSessionId is null when absent", () => {
    vi.stubGlobal("window", { location: { search: "" } })
    expect(getReturnedCheckoutSessionId()).toBeNull()
  })

  it("clearCheckoutParam strips checkout + session_id but keeps other params", () => {
    const replaceState = vi.fn()
    vi.stubGlobal("window", {
      location: { href: "https://example.com/?checkout=success&session_id=cs_test_123&keep=me" },
      history: { replaceState },
    })
    clearCheckoutParam()
    expect(replaceState).toHaveBeenCalledTimes(1)
    const [, , url] = replaceState.mock.calls[0] as [unknown, unknown, string]
    expect(url).toContain("keep=me")
    expect(url).not.toContain("checkout=")
    expect(url).not.toContain("session_id=")
  })
})
