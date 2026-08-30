import { describe, it, expect } from "vitest"
import { checkLimits } from "@/lib/subscription/enforce"
import type { UsageCounters, UsageLimits } from "@/lib/subscription/usage"

const zeroCounters = (): UsageCounters => ({
  texts_submitted: 0,
  texts_submitted_today: 0,
  chunks_returned: 0,
  pages_processed: 0,
  chars_processed: 0,
  chars_processed_period: 0,
  chars_processed_today: 0,
  api_calls: 0,
  voice_requests: 0,
})

const openLimits = (): UsageLimits => ({
  texts_submitted: null,
  texts_submitted_today: null,
  chunks_returned: null,
  pages_processed: null,
  chars_processed: null,
  chars_processed_period: null,
  chars_processed_today: null,
  api_calls: null,
  voice_requests: null,
})

describe("checkLimits — cumulative metric (texts_submitted, limit=5)", () => {
  const limits = { ...openLimits(), texts_submitted: 5 }

  it("allows a submission well under the limit", () => {
    const result = checkLimits(zeroCounters(), limits, { texts_submitted: 1 })
    expect(result.level).toBe("clean")
    expect(result.allowed).toBe(true)
  })

  it("warns at the 80% band", () => {
    const counters = { ...zeroCounters(), texts_submitted: 3 }
    const result = checkLimits(counters, limits, { texts_submitted: 1 })
    expect(result.level).toBe("warning")
    expect(result.allowed).toBe(true)
  })

  it("blocks exactly at the limit — matches the docstring's 'at/over limit' contract", () => {
    const counters = { ...zeroCounters(), texts_submitted: 4 }
    const result = checkLimits(counters, limits, { texts_submitted: 1 })
    expect(result.level).toBe("blocked")
    expect(result.allowed).toBe(false)
  })

  it("blocks over the limit", () => {
    const counters = { ...zeroCounters(), texts_submitted: 5 }
    const result = checkLimits(counters, limits, { texts_submitted: 1 })
    expect(result.level).toBe("blocked")
  })

  it("honors a custom blockRatio instead of silently ignoring it", () => {
    const looseCounters = { ...zeroCounters(), texts_submitted: 1 } // 40% after +1
    expect(
      checkLimits(looseCounters, limits, { texts_submitted: 1 }, { blockRatio: 0.5 }).level,
    ).toBe("clean")

    const tightCounters = { ...zeroCounters(), texts_submitted: 2 } // 60% after +1
    expect(
      checkLimits(tightCounters, limits, { texts_submitted: 1 }, { blockRatio: 0.5 }).level,
    ).toBe("blocked")
  })

  it("zero-limit edge case: blocks any positive submission, allows a zero one", () => {
    const zeroLimit = { ...openLimits(), texts_submitted: 0 }
    expect(checkLimits(zeroCounters(), zeroLimit, { texts_submitted: 1 }).level).toBe("blocked")
    expect(checkLimits(zeroCounters(), zeroLimit, { texts_submitted: 0 }).allowed).toBe(true)
  })
})

describe("checkLimits — per-submission metric (chars_processed, limit=100)", () => {
  const limits = { ...openLimits(), chars_processed: 100 }

  it("allows under the cap", () => {
    expect(checkLimits(zeroCounters(), limits, { chars_processed: 50 }).level).toBe("clean")
  })

  it("blocks exactly at the cap", () => {
    expect(checkLimits(zeroCounters(), limits, { chars_processed: 100 }).level).toBe("blocked")
  })

  it("blocks over the cap", () => {
    expect(checkLimits(zeroCounters(), limits, { chars_processed: 150 }).level).toBe("blocked")
  })

  it("is unaffected by prior usage — only the proposed increment matters", () => {
    const heavyPriorUsage = { ...zeroCounters(), chars_processed: 99999 }
    expect(checkLimits(heavyPriorUsage, limits, { chars_processed: 50 }).level).toBe("clean")
  })
})

describe("checkLimits — uncapped metrics", () => {
  it("passes through metrics with no limit key without blocking", () => {
    const result = checkLimits(zeroCounters(), openLimits(), { api_calls: 1_000_000 })
    expect(result.level).toBe("clean")
    expect(result.allowed).toBe(true)
  })
})
