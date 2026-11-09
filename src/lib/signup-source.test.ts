// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const upsert = vi.fn()
vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn(() => ({ upsert })) },
}))

import {
  captureSignupSource,
  getStoredSignupSource,
  parseSignupSource,
  recordSignupSource,
} from "@/lib/signup-source"

const NOW = new Date("2026-11-09T12:00:00Z")

describe("parseSignupSource", () => {
  it("reads ?ref and lowercases it", () => {
    expect(parseSignupSource("?ref=LinkedIn", "/", "", NOW)).toMatchObject({
      source: "linkedin",
      utm_medium: null,
      landing_path: "/",
    })
  })

  it("falls back to utm_source and keeps medium/campaign", () => {
    expect(
      parseSignupSource("?utm_source=reddit&utm_medium=post&utm_campaign=launch", "/discover", "https://reddit.com/", NOW),
    ).toMatchObject({
      source: "reddit",
      utm_medium: "post",
      utm_campaign: "launch",
      landing_path: "/discover",
      referrer: "https://reddit.com/",
    })
  })

  it("returns null with no tag", () => {
    expect(parseSignupSource("?code=abc", "/", "", NOW)).toBeNull()
    expect(parseSignupSource("?ref=%20", "/", "", NOW)).toBeNull()
  })
})

describe("capture + record", () => {
  beforeEach(() => {
    localStorage.clear()
    upsert.mockReset()
    upsert.mockResolvedValue({ error: null })
  })

  it("keeps the first tag this browser saw", () => {
    window.history.replaceState(null, "", "/?ref=linkedin")
    captureSignupSource()
    window.history.replaceState(null, "", "/?ref=tiktok")
    captureSignupSource()
    expect(getStoredSignupSource()?.source).toBe("linkedin")
  })

  it("writes once per user id, and again for a new user id", async () => {
    window.history.replaceState(null, "", "/?ref=reddit")
    captureSignupSource()

    await recordSignupSource("guest-1")
    await recordSignupSource("guest-1")
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "guest-1", source: "reddit" }),
      { onConflict: "user_id", ignoreDuplicates: true },
    )

    await recordSignupSource("real-1")
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it("retries later when the write fails", async () => {
    window.history.replaceState(null, "", "/?ref=reddit")
    captureSignupSource()
    upsert.mockResolvedValueOnce({ error: { message: "relation does not exist" } })
    await recordSignupSource("u1")
    await recordSignupSource("u1")
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it("does nothing without a stored tag", async () => {
    window.history.replaceState(null, "", "/")
    captureSignupSource()
    await recordSignupSource("u1")
    expect(upsert).not.toHaveBeenCalled()
  })
})
