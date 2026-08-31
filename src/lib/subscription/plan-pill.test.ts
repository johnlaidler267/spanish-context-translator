import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  GUEST_PLAN_PILL,
  daysLeftInTrial,
  planPillFromRow,
  formatPlanSubtitle,
} from "@/lib/subscription/plan-pill"

describe("daysLeftInTrial", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("is 0 when there's no trial end date", () => {
    expect(daysLeftInTrial(null)).toBe(0)
  })

  it("rounds up partial days remaining", () => {
    // 2.5 days out -> should show 3, not 2 (never under-promise trial time)
    expect(daysLeftInTrial("2026-01-03T12:00:00Z")).toBe(3)
  })

  it("is exactly N for a clean N-day-out timestamp", () => {
    expect(daysLeftInTrial("2026-01-08T00:00:00Z")).toBe(7)
  })

  it("never goes negative for a trial end already in the past", () => {
    expect(daysLeftInTrial("2025-12-01T00:00:00Z")).toBe(0)
  })
})

describe("planPillFromRow", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("shows the guest free pill for a signed-out/anonymous user with no row", () => {
    expect(planPillFromRow(null, true)).toEqual({
      mode: "link",
      to: "/upgrade",
      primary: "Free · Guest",
      secondary: "Upgrade",
    })
  })

  it("shows the normal free pill for a signed-in user with no row", () => {
    expect(planPillFromRow(null, false)).toEqual({
      mode: "link",
      to: "/upgrade",
      primary: "Free Plan",
      secondary: "Upgrade",
    })
  })

  it("shows a trial pill with days-left for an active trial", () => {
    const pill = planPillFromRow(
      { plan_id: "pro", status: "trialing", trial_end: "2026-01-04T00:00:00Z" },
      false,
    )
    expect(pill).toEqual({
      mode: "link",
      to: "/settings?tab=billing",
      primary: "Pro Trial",
      secondary: "3 days left",
    })
  })

  it("uses singular 'day' when exactly 1 day is left", () => {
    const pill = planPillFromRow(
      { plan_id: "pro", status: "trialing", trial_end: "2026-01-02T00:00:00Z" },
      false,
    )
    expect(pill.secondary).toBe("1 day left")
  })

  it("shows a plain plan pill for an active paid subscription", () => {
    expect(planPillFromRow({ plan_id: "pro", status: "active", trial_end: null }, false)).toEqual({
      mode: "link",
      to: "/settings?tab=billing",
      primary: "Pro",
      secondary: "Plan",
    })
  })

  it("shows a payment-failed pill for past_due", () => {
    expect(planPillFromRow({ plan_id: "pro", status: "past_due", trial_end: null }, false)).toEqual(
      {
        mode: "link",
        to: "/settings?tab=billing",
        primary: "Pro Plan",
        secondary: "Payment Failed",
      },
    )
  })

  it("falls back to the free pill for a canceled/lapsed row", () => {
    expect(
      planPillFromRow({ plan_id: "pro", status: "canceled", trial_end: null }, false),
    ).toEqual({
      mode: "link",
      to: "/upgrade",
      primary: "Free Plan",
      secondary: "Upgrade",
    })
  })

  it("never throws for an unrecognized plan_id (getTier's normalizeTierId falls back to free)", () => {
    // planPillFromRow has a try/catch around getTier() for "unknown plan_id in
    // DB", but getTier can't actually throw -- normalizeTierId maps any
    // unrecognized string to "free" rather than passing it through. So an
    // unknown id here reads as the Free tier's name, not the catch's "Plan"
    // fallback. Pinning the real behavior so a future normalizeTierId change
    // doesn't silently change what users see for a bad plan_id.
    const pill = planPillFromRow({ plan_id: "mystery_tier", status: "active", trial_end: null }, false)
    expect(pill.primary).toBe("Free")
  })
})

describe("formatPlanSubtitle", () => {
  it("returns just the primary text for a sign-in pill", () => {
    expect(formatPlanSubtitle(GUEST_PLAN_PILL)).toBe("Sign in")
  })

  it("joins primary and secondary with a middle dot when both are present", () => {
    expect(
      formatPlanSubtitle({ mode: "link", to: "/upgrade", primary: "Free Plan", secondary: "Upgrade" }),
    ).toBe("Free Plan · Upgrade")
  })

  it("omits the separator when secondary is empty", () => {
    expect(
      formatPlanSubtitle({ mode: "link", to: "/upgrade", primary: "Free Plan", secondary: "" }),
    ).toBe("Free Plan")
  })
})
