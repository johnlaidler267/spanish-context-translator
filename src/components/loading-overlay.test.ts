import { describe, expect, it } from "vitest"

import { LOADING_OVERLAY_PROGRESS_MS } from "./loading-overlay"

// The overlay's progress bar is a fixed-duration, constant-rate fill from 0% to 100% -- it never
// stalls partway (the old "flat at 92%" bug: capping the bar until real work finished) and never
// sits at a stale 100% either, because it's not gated on real completion in the first place. This
// is the simple linear-interpolation math the component's rAF loop drives the bar with.
function barWidthAt(elapsedMs: number): number {
  const linearT = Math.min(1, elapsedMs / LOADING_OVERLAY_PROGRESS_MS)
  return linearT * 100
}

describe("loading overlay bar fill", () => {
  it("starts at 0 and reaches exactly 100 by the fill duration", () => {
    expect(barWidthAt(0)).toBe(0)
    expect(barWidthAt(LOADING_OVERLAY_PROGRESS_MS)).toBe(100)
  })

  it("advances at a constant rate (no easing/deceleration)", () => {
    const quarter = barWidthAt(LOADING_OVERLAY_PROGRESS_MS * 0.25)
    const half = barWidthAt(LOADING_OVERLAY_PROGRESS_MS * 0.5)
    const threeQuarters = barWidthAt(LOADING_OVERLAY_PROGRESS_MS * 0.75)
    expect(half - quarter).toBeCloseTo(25, 5)
    expect(threeQuarters - half).toBeCloseTo(25, 5)
  })

  it("never exceeds 100, however long real work takes", () => {
    expect(barWidthAt(LOADING_OVERLAY_PROGRESS_MS * 10)).toBe(100)
  })
})
