import { describe, it, expect } from "vitest"
import {
  normalizeTierId,
  getTier,
  getLimit,
  hasFeature,
  formatPrice,
  formatAnnualMonthlyEquivalent,
  isUnlimited,
} from "@/lib/subscription/tiers"

describe("normalizeTierId", () => {
  it("maps the legacy 'unlimited' tier ID to pro", () => {
    expect(normalizeTierId("unlimited")).toBe("pro")
  })

  it("passes through known tier IDs unchanged", () => {
    expect(normalizeTierId("pro")).toBe("pro")
    expect(normalizeTierId("free")).toBe("free")
  })

  it("falls back to free for anything unrecognized", () => {
    expect(normalizeTierId("enterprise")).toBe("free")
    expect(normalizeTierId("")).toBe("free")
  })
})

describe("getTier", () => {
  it("returns the free tier config for a free ID", () => {
    expect(getTier("free").id).toBe("free")
  })

  it("normalizes 'unlimited' to the pro tier config", () => {
    expect(getTier("unlimited").id).toBe("pro")
  })

  it("falls back to free for an unknown ID rather than throwing", () => {
    expect(getTier("nonexistent-plan").id).toBe("free")
  })
})

describe("getLimit / isUnlimited", () => {
  it("free tier caps texts per day but not per month", () => {
    expect(getLimit("free", "textsPerDay")).toBe(5)
    expect(isUnlimited("free", "textsPerMonth")).toBe(true)
  })

  it("pro tier has no per-submission char cap but does have fair-use monthly/daily caps", () => {
    expect(isUnlimited("pro", "charsPerSubmission")).toBe(true)
    expect(getLimit("pro", "charsPerMonth")).not.toBeNull()
    expect(getLimit("pro", "charsPerDay")).not.toBeNull()
  })
})

describe("hasFeature", () => {
  it("free tier does not get export or API access", () => {
    expect(hasFeature("free", "exportTranslations")).toBe(false)
    expect(hasFeature("free", "apiAccess")).toBe(false)
  })

  it("pro tier gets every feature flag", () => {
    expect(hasFeature("pro", "exportTranslations")).toBe(true)
    expect(hasFeature("pro", "apiAccess")).toBe(true)
    expect(hasFeature("pro", "prioritySupport")).toBe(true)
  })
})

describe("formatPrice", () => {
  it("formats zero as $0, not $0.00", () => {
    expect(formatPrice(0)).toBe("$0")
  })

  it("formats a whole-dollar amount without decimals", () => {
    expect(formatPrice(700)).toBe("$7")
    expect(formatPrice(5_900)).toBe("$59")
  })

  it("formats a fractional-dollar amount with two decimals", () => {
    expect(formatPrice(750)).toBe("$7.50")
    expect(formatPrice(999)).toBe("$9.99")
  })
})

describe("formatAnnualMonthlyEquivalent", () => {
  it("divides the annual price by 12 and rounds to the nearest cent", () => {
    // pro annual = $59.00/yr -> $59/12 = $4.9166... -> rounds to $4.92
    expect(formatAnnualMonthlyEquivalent("pro")).toBe("$4.92")
  })

  it("free tier is always $0/mo equivalent", () => {
    expect(formatAnnualMonthlyEquivalent("free")).toBe("$0")
  })
})
