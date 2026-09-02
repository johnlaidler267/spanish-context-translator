import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  lapsedModalAckKey,
  readLapsedModalAck,
  writeLapsedModalAck,
  clearLapsedModalAck,
} from "@/contexts/subscription-context"

// The lapsed-subscription popup shouldn't reopen after a user dismisses it --
// not even across browser sessions/logins, since it's meant to be a one-time
// nag per lapse, not a once-per-tab one. It's also scoped to userId so a
// SIGNED-OUT default (no userId) never leaks into a DIFFERENT signed-in
// user's dismissal on a shared browser. Directly relevant given the earlier
// fix in this project where the lapsed modal was stacking incorrectly.

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

describe("lapsedModalAckKey", () => {
  it("scopes the key to the user id when present", () => {
    expect(lapsedModalAckKey("user-123")).toBe("lapsed_modal_ack_user-123")
  })

  it("falls back to a shared key when there's no user id", () => {
    expect(lapsedModalAckKey(undefined)).toBe("lapsed_modal_ack")
  })

  it("two different users get two different keys", () => {
    expect(lapsedModalAckKey("user-a")).not.toBe(lapsedModalAckKey("user-b"))
  })
})

describe("readLapsedModalAck / writeLapsedModalAck / clearLapsedModalAck", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it("reads false when nothing has been written yet", () => {
    expect(readLapsedModalAck("user-123")).toBe(false)
  })

  it("read reflects a prior write for the same user", () => {
    writeLapsedModalAck("user-123")
    expect(readLapsedModalAck("user-123")).toBe(true)
  })

  it("dismissal for one user does not leak into another user's read", () => {
    writeLapsedModalAck("user-a")
    expect(readLapsedModalAck("user-a")).toBe(true)
    expect(readLapsedModalAck("user-b")).toBe(false)
  })

  it("write is a no-op with no userId (never persists a signed-out ack)", () => {
    writeLapsedModalAck(undefined)
    expect(readLapsedModalAck(undefined)).toBe(false)
  })

  it("is false when window/localStorage aren't available (SSR-safe read)", () => {
    vi.stubGlobal("window", undefined)
    expect(readLapsedModalAck("user-123")).toBe(false)
  })

  it("persists across what would be separate browser sessions (no sessionStorage involved)", () => {
    writeLapsedModalAck("user-123")
    // Simulate a fresh tab/session by re-reading with a brand new call --
    // localStorage-backed reads don't depend on any session state.
    expect(readLapsedModalAck("user-123")).toBe(true)
  })

  it("clear resets the ack so a future lapse can show the popup again", () => {
    writeLapsedModalAck("user-123")
    expect(readLapsedModalAck("user-123")).toBe(true)
    clearLapsedModalAck("user-123")
    expect(readLapsedModalAck("user-123")).toBe(false)
  })
})
