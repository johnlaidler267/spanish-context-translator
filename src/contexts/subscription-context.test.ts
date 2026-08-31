import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  lapsedModalSessionKey,
  readLapsedModalAckSession,
  writeLapsedModalAckSession,
} from "@/contexts/subscription-context"

// The lapsed-subscription popup shouldn't reopen after a user dismisses it,
// but a SIGNED-OUT default (no userId) must never leak into a DIFFERENT
// signed-in user's dismissal on a shared browser -- these three functions are
// what keeps that scoped correctly. Directly relevant given the earlier fix
// this project where the lapsed modal was stacking incorrectly.

function makeMemorySessionStorage(): Storage {
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

describe("lapsedModalSessionKey", () => {
  it("scopes the key to the user id when present", () => {
    expect(lapsedModalSessionKey("user-123")).toBe("lapsed_modal_ack_user-123")
  })

  it("falls back to a shared key when there's no user id", () => {
    expect(lapsedModalSessionKey(undefined)).toBe("lapsed_modal_ack")
  })

  it("two different users get two different keys", () => {
    expect(lapsedModalSessionKey("user-a")).not.toBe(lapsedModalSessionKey("user-b"))
  })
})

describe("readLapsedModalAckSession / writeLapsedModalAckSession", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("sessionStorage", makeMemorySessionStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it("reads false when nothing has been written yet", () => {
    expect(readLapsedModalAckSession("user-123")).toBe(false)
  })

  it("read reflects a prior write for the same user", () => {
    writeLapsedModalAckSession("user-123")
    expect(readLapsedModalAckSession("user-123")).toBe(true)
  })

  it("dismissal for one user does not leak into another user's read", () => {
    writeLapsedModalAckSession("user-a")
    expect(readLapsedModalAckSession("user-a")).toBe(true)
    expect(readLapsedModalAckSession("user-b")).toBe(false)
  })

  it("write is a no-op with no userId (never persists a signed-out ack)", () => {
    writeLapsedModalAckSession(undefined)
    expect(readLapsedModalAckSession(undefined)).toBe(false)
  })

  it("is false when window/sessionStorage aren't available (SSR-safe read)", () => {
    vi.stubGlobal("window", undefined)
    expect(readLapsedModalAckSession("user-123")).toBe(false)
  })
})
