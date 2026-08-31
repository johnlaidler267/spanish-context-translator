import { describe, it, expect } from "vitest"
import {
  subscriptionRowShowsAsFreePlan,
  pricingUiPlanIdFromRow,
} from "@/lib/subscription/subscription-display"

describe("subscriptionRowShowsAsFreePlan", () => {
  it("is true when there's no row at all (guest / never subscribed)", () => {
    expect(subscriptionRowShowsAsFreePlan(null)).toBe(true)
  })

  it("is true for an explicit free-plan row regardless of status", () => {
    expect(subscriptionRowShowsAsFreePlan({ plan_id: "free", status: "active", trial_end: null }))
      .toBe(true)
  })

  it("is false for an active paid plan", () => {
    expect(subscriptionRowShowsAsFreePlan({ plan_id: "pro", status: "active", trial_end: null }))
      .toBe(false)
  })

  it("is false while trialing a paid plan", () => {
    expect(
      subscriptionRowShowsAsFreePlan({ plan_id: "pro", status: "trialing", trial_end: "2099-01-01" }),
    ).toBe(false)
  })

  it("is false for a past_due paid plan (still shown as paid during grace)", () => {
    expect(subscriptionRowShowsAsFreePlan({ plan_id: "pro", status: "past_due", trial_end: null }))
      .toBe(false)
  })

  it("is true for a canceled/lapsed paid plan (no longer entitled)", () => {
    expect(subscriptionRowShowsAsFreePlan({ plan_id: "pro", status: "canceled", trial_end: null }))
      .toBe(true)
  })
})

describe("pricingUiPlanIdFromRow", () => {
  it("returns 'free' when the row shows as free", () => {
    expect(pricingUiPlanIdFromRow(null)).toBe("free")
    expect(pricingUiPlanIdFromRow({ plan_id: "free", status: "active", trial_end: null })).toBe(
      "free",
    )
  })

  it("returns the normalized tier id for an active paid row", () => {
    expect(pricingUiPlanIdFromRow({ plan_id: "pro", status: "active", trial_end: null })).toBe(
      "pro",
    )
  })

  it("maps legacy 'unlimited' plan_id to 'pro'", () => {
    expect(
      pricingUiPlanIdFromRow({ plan_id: "unlimited", status: "active", trial_end: null }),
    ).toBe("pro")
  })

  it("falls back to 'free' for a canceled paid row even though plan_id is still 'pro'", () => {
    // This is the important case: plan_id alone is not enough to decide pricing
    // UI — a canceled/lapsed row must show free-tier pricing, not the old plan.
    expect(
      pricingUiPlanIdFromRow({ plan_id: "pro", status: "canceled", trial_end: null }),
    ).toBe("free")
  })
})
