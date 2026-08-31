import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { diffTiers, lowerTierIds, isWithinGracePeriod } from "@/lib/subscription/subscription"

// ─── diffTiers ─────────────────────────────────────────────────────────────────
// Drives the "here's what you'll lose" confirmation dialog shown before a
// downgrade/cancel — getting this wrong means promising or hiding the wrong
// features/limits to a paying user.

describe("diffTiers", () => {
  it("downgrading pro -> free reports the features pro has that free doesn't", () => {
    const diff = diffTiers("pro", "free")
    expect(diff.lostFeatures).toEqual(
      expect.arrayContaining([
        "Export translations",
        "API access",
        "Priority support",
        "Dedicated support",
      ]),
    )
    // Shared on both tiers -- must NOT show up as "lost".
    expect(diff.lostFeatures).not.toContain("Article mode")
    expect(diff.lostFeatures).not.toContain("Read mode")
  })

  it("downgrading pro -> free reports every limit that goes from unlimited to capped", () => {
    const diff = diffTiers("pro", "free")
    const labels = diff.tighterLimits.map((l) => l.label)
    expect(labels).toEqual(
      expect.arrayContaining([
        "submissions per day",
        "chunks per request",
        "chars per submission",
        "saved translations",
      ]),
    )
  })

  it("formats an unlimited-to-N change as 'Unlimited X' -> 'N X'", () => {
    const diff = diffTiers("pro", "free")
    const chars = diff.tighterLimits.find((l) => l.label === "chars per submission")
    expect(chars).toEqual({
      label: "chars per submission",
      from: "Unlimited chars/submission",
      to: "600 chars/submission",
    })
  })

  it("upgrading free -> pro loses nothing", () => {
    const diff = diffTiers("free", "pro")
    expect(diff.lostFeatures).toEqual([])
    expect(diff.tighterLimits).toEqual([])
  })

  it("comparing a tier to itself loses nothing", () => {
    expect(diffTiers("pro", "pro")).toEqual({ lostFeatures: [], tighterLimits: [] })
    expect(diffTiers("free", "free")).toEqual({ lostFeatures: [], tighterLimits: [] })
  })
})

describe("lowerTierIds", () => {
  it("free has no lower tier", () => {
    expect(lowerTierIds("free")).toEqual([])
  })

  it("pro's only lower tier is free", () => {
    expect(lowerTierIds("pro")).toEqual(["free"])
  })
})

// ─── isWithinGracePeriod ───────────────────────────────────────────────────────
// Decides past_due (still has access) vs lapsed (upgrade popup triggers) --
// exactly the boundary-condition-prone logic that had a real >= vs > bug
// elsewhere in the billing code (enforce.ts) earlier this project.

describe("isWithinGracePeriod", () => {
  const GRACE_DAYS = 3

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("is true immediately after going past_due", () => {
    expect(isWithinGracePeriod("2026-01-10T00:00:00Z")).toBe(true)
  })

  it("is true just before the grace deadline", () => {
    const justBefore = new Date("2026-01-10T00:00:00Z")
    justBefore.setDate(justBefore.getDate() - GRACE_DAYS)
    justBefore.setSeconds(justBefore.getSeconds() + 1) // 1s inside the window
    expect(isWithinGracePeriod(justBefore.toISOString())).toBe(true)
  })

  it("is false once the grace period has fully elapsed", () => {
    const past = new Date("2026-01-10T00:00:00Z")
    past.setDate(past.getDate() - GRACE_DAYS - 1)
    expect(isWithinGracePeriod(past.toISOString())).toBe(false)
  })
})
