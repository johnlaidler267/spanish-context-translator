import { describe, it, expect } from "vitest"
import {
  formatPlanLimitModal,
  buildUsageLimitsFromTier,
  withCharsFairUseMirrors,
  stripVirtualUsageIncrements,
  computeExceededFromCounters,
  getLimitStatus,
  ALL_METRICS,
  type UsageCounters,
  type UsageLimits,
} from "@/lib/subscription/usage"

function zeroCounters(): UsageCounters {
  return Object.fromEntries(ALL_METRICS.map((m) => [m, 0])) as UsageCounters
}

function nullLimits(): UsageLimits {
  return Object.fromEntries(ALL_METRICS.map((m) => [m, null])) as UsageLimits
}

// ─── formatPlanLimitModal ─────────────────────────────────────────────────────
// This drives the exact modal copy shown to users, including the "Submission
// exceeds plan allowance" modal that stacked on top of the Discover modal
// earlier this project — worth pinning its title/message pairing per case.

describe("formatPlanLimitModal", () => {
  it("shows submission-allowance copy for a single per-submission metric", () => {
    const { title, message } = formatPlanLimitModal(["chars_processed"])
    expect(title).toBe("Submission exceeds plan allowance")
    expect(message).toContain("character allowance")
  })

  it("shows submission-allowance copy for pages_processed", () => {
    const { title } = formatPlanLimitModal(["pages_processed"])
    expect(title).toBe("Submission exceeds plan allowance")
  })

  it("shows submission-allowance copy for chunks_returned", () => {
    const { title } = formatPlanLimitModal(["chunks_returned"])
    expect(title).toBe("Submission exceeds plan allowance")
  })

  it("lists multiple per-submission metrics by label", () => {
    const { message } = formatPlanLimitModal(["chars_processed", "pages_processed"])
    expect(message).toContain("Characters processed")
    expect(message).toContain("Pages processed")
  })

  it("shows the fair-use monthly-character copy for chars_processed_period alone", () => {
    const { title, message } = formatPlanLimitModal(["chars_processed_period"])
    expect(title).toBe("Plan limit reached")
    expect(message).toContain("billing period")
  })

  it("shows the fair-use daily-character copy for chars_processed_today alone", () => {
    const { message } = formatPlanLimitModal(["chars_processed_today"])
    expect(message).toContain("today's fair-use")
  })

  it("shows generic period copy for a period metric with no special-case wording", () => {
    const { title, message } = formatPlanLimitModal(["texts_submitted"])
    expect(title).toBe("Plan limit reached")
    expect(message).toContain("Texts submitted")
  })

  it("combines period + per-submission wording when both kinds are blocked at once", () => {
    const { message } = formatPlanLimitModal(["texts_submitted", "chars_processed"])
    expect(message).toContain("reached your plan limit for: Texts submitted")
    expect(message).toContain("also exceeds your plan's allowance for: Characters processed")
  })

  it("falls back to a generic message for an empty blocked list", () => {
    const { title, message } = formatPlanLimitModal([])
    expect(title).toBe("Plan limit reached")
    expect(message).toBe("You've reached a plan limit.")
  })
})

// ─── buildUsageLimitsFromTier ─────────────────────────────────────────────────

describe("buildUsageLimitsFromTier", () => {
  it("free tier has finite per-day/per-submission caps and null monthly text cap", () => {
    const limits = buildUsageLimitsFromTier("free")
    expect(limits.texts_submitted_today).toBe(5)
    expect(limits.chars_processed).toBe(600)
    expect(limits.texts_submitted).toBeNull()
    expect(limits.api_calls).toBeNull() // never limit-checked, always null
  })

  it("pro tier is unlimited everywhere except the fair-use character mirrors", () => {
    const limits = buildUsageLimitsFromTier("pro")
    expect(limits.texts_submitted).toBeNull()
    expect(limits.chars_processed).toBeNull()
    expect(limits.chars_processed_period).not.toBeNull()
    expect(limits.chars_processed_today).not.toBeNull()
  })
})

// ─── withCharsFairUseMirrors / stripVirtualUsageIncrements ───────────────────

describe("withCharsFairUseMirrors", () => {
  it("mirrors chars_processed into the period and today virtual metrics", () => {
    const out = withCharsFairUseMirrors({ chars_processed: 500 })
    expect(out.chars_processed_period).toBe(500)
    expect(out.chars_processed_today).toBe(500)
  })

  it("does not overwrite an explicitly-provided mirror value", () => {
    const out = withCharsFairUseMirrors({ chars_processed: 500, chars_processed_today: 999 })
    expect(out.chars_processed_today).toBe(999)
    expect(out.chars_processed_period).toBe(500)
  })

  it("leaves increments untouched when chars_processed is absent or zero", () => {
    expect(withCharsFairUseMirrors({ texts_submitted: 1 })).toEqual({ texts_submitted: 1 })
    expect(withCharsFairUseMirrors({ chars_processed: 0 })).toEqual({ chars_processed: 0 })
  })
})

describe("stripVirtualUsageIncrements", () => {
  it("removes the two virtual keys but keeps everything else", () => {
    const out = stripVirtualUsageIncrements({
      chars_processed: 500,
      chars_processed_period: 500,
      chars_processed_today: 500,
      texts_submitted: 1,
    })
    expect(out).toEqual({ chars_processed: 500, texts_submitted: 1 })
  })
})

// ─── computeExceededFromCounters ──────────────────────────────────────────────
// Mirrors the server's exceeded-metric logic client-side — this is the same
// class of at/over-limit boundary logic that had a real >= vs > bug fixed
// earlier in enforce.ts, so the boundary cases matter most here.

describe("computeExceededFromCounters", () => {
  it("a per-submission metric is exceeded only when the increment strictly exceeds the cap", () => {
    const limits = { ...nullLimits(), chars_processed: 600 }
    expect(
      computeExceededFromCounters(zeroCounters(), limits, { chars_processed: 600 }),
    ).toEqual([])
    expect(
      computeExceededFromCounters(zeroCounters(), limits, { chars_processed: 601 }),
    ).toContain("chars_processed")
  })

  it("a period metric is exceeded only once the running counter goes past the cap", () => {
    // Counters here are POST-increment (this mirrors track-usage, which
    // increments then checks) -- landing exactly on the cap is the last
    // allowed use, not yet "exceeded". That's a different point in the flow
    // than enforce.ts's pre-flight check, which blocks AT the cap before
    // incrementing -- both are intentional, just for different call sites.
    const limits = { ...nullLimits(), texts_submitted: 5 }
    expect(
      computeExceededFromCounters({ ...zeroCounters(), texts_submitted: 5 }, limits, {}),
    ).toEqual([])
    expect(
      computeExceededFromCounters({ ...zeroCounters(), texts_submitted: 6 }, limits, {}),
    ).toContain("texts_submitted")
  })

  it("a metric with a null cap is never exceeded", () => {
    const limits = nullLimits()
    expect(
      computeExceededFromCounters({ ...zeroCounters(), texts_submitted: 999999 }, limits, {}),
    ).toEqual([])
  })

  it("checks the chars_processed increment against the fair-use mirrors, not the raw counters", () => {
    const limits = { ...nullLimits(), chars_processed_period: 1000 }
    // Counter itself is already way over, but what matters for THIS submission
    // is the increment (mirrored from chars_processed), not the running total.
    const exceeded = computeExceededFromCounters(
      { ...zeroCounters(), chars_processed_period: 5000 },
      limits,
      { chars_processed: 1500 },
    )
    expect(exceeded).toContain("chars_processed_period")
  })
})

// ─── getLimitStatus ────────────────────────────────────────────────────────────

describe("getLimitStatus", () => {
  it("is unlimited (no ratio, never exceeded/near-limit) when the cap is null", () => {
    const status = getLimitStatus("texts_submitted", zeroCounters(), nullLimits())
    expect(status).toEqual({ current: 0, limit: null, ratio: null, exceeded: false, nearLimit: false })
  })

  it("computes the fill ratio and near-limit flag at the 80% threshold", () => {
    const limits = { ...nullLimits(), texts_submitted: 10 }
    const under = getLimitStatus("texts_submitted", { ...zeroCounters(), texts_submitted: 7 }, limits)
    expect(under.ratio).toBeCloseTo(0.7)
    expect(under.nearLimit).toBe(false)

    const atThreshold = getLimitStatus(
      "texts_submitted",
      { ...zeroCounters(), texts_submitted: 8 },
      limits,
    )
    expect(atThreshold.nearLimit).toBe(true)
  })

  it("exceeded flips true at current === limit (>=, not strictly over)", () => {
    const limits = { ...nullLimits(), texts_submitted: 10 }
    const atCap = getLimitStatus("texts_submitted", { ...zeroCounters(), texts_submitted: 10 }, limits)
    expect(atCap.exceeded).toBe(true)

    const justUnder = getLimitStatus(
      "texts_submitted",
      { ...zeroCounters(), texts_submitted: 9 },
      limits,
    )
    expect(justUnder.exceeded).toBe(false)
  })
})
