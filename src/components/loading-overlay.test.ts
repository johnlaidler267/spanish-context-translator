import { describe, expect, it } from "vitest"

import { fakeProgressWidth, finishProgressWidth, LOADING_OVERLAY_PROGRESS_MS } from "./loading-overlay"

// Regression coverage for: "Translation loading bar stalls before article page" -- the overlay
// used to hold flat at a fixed width (92%) for however long the real setup work outlasted its
// own fill animation, which reads as broken/frozen on a slow connection. `fakeProgressWidth` is
// the fix: a curve driven purely by wall-clock time that keeps inching forward no matter how
// long the real work takes, instead of ever going flat.
describe("fakeProgressWidth", () => {
  it("starts at 0 and never returns a width at or above 100", () => {
    expect(fakeProgressWidth(0)).toBe(0)
    expect(fakeProgressWidth(500)).toBeLessThan(100)
    expect(fakeProgressWidth(60_000)).toBeLessThan(100)
  })

  it("is monotonically increasing, including long after the fast initial phase", () => {
    const samples = [0, 200, 600, LOADING_OVERLAY_PROGRESS_MS, 2000, 5000, 15_000, 60_000]
    for (let i = 1; i < samples.length; i++) {
      expect(fakeProgressWidth(samples[i]!)).toBeGreaterThan(fakeProgressWidth(samples[i - 1]!))
    }
  })

  it("keeps advancing well past the old fixed clock instead of going flat", () => {
    // This is the exact bug: real setup work (a slow fetch, a big reflow) legitimately outlasting
    // the bar's own short fill animation. Before the fix the bar would sit unchanged from this
    // point on; now it should still be visibly climbing several seconds later.
    const atClockEnd = fakeProgressWidth(LOADING_OVERLAY_PROGRESS_MS)
    const fourSecondsLater = fakeProgressWidth(LOADING_OVERLAY_PROGRESS_MS + 4000)
    expect(fourSecondsLater).toBeGreaterThan(atClockEnd + 1)
  })
})

describe("finishProgressWidth", () => {
  it("starts at the hand-off width and eases up to exactly 100", () => {
    expect(finishProgressWidth(80, 0)).toBe(80)
    expect(finishProgressWidth(80, 100_000)).toBe(100)
  })

  it("is monotonically increasing toward 100 over the animation window", () => {
    const start = 75
    let prev = finishProgressWidth(start, 0)
    for (const t of [20, 60, 120, 200, 300]) {
      const next = finishProgressWidth(start, t)
      expect(next).toBeGreaterThanOrEqual(prev)
      prev = next
    }
    expect(prev).toBe(100)
  })
})
