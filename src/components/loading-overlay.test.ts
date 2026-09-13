import { describe, expect, it } from "vitest"

import { displayBarWidth, PRE_READY_MAX_WIDTH } from "./loading-overlay"

// Regression test for: "Translation loading bar stalls before article page" -- the overlay's
// progress bar fills to 100% on a fixed internal clock (LOADING_OVERLAY_PROGRESS_MS) that's
// independent of whether the real setup work (page-split reflow, usage preflight, cloud
// progress pull) has actually finished. On a submission where that real work legitimately
// outlasts the bar's own fill time, the bar used to sit frozen at a stale 100% until the real
// work caught up -- a visible stall right before the article page mounts.
describe("displayBarWidth", () => {
  it("passes the raw width through unchanged once ready, even at 100%", () => {
    expect(displayBarWidth(100, true)).toBe(100)
    expect(displayBarWidth(50, true)).toBe(50)
    expect(displayBarWidth(0, true)).toBe(0)
  })

  it("does not clamp raw widths already at or below the pre-ready cap", () => {
    expect(displayBarWidth(0, false)).toBe(0)
    expect(displayBarWidth(50, false)).toBe(50)
    expect(displayBarWidth(PRE_READY_MAX_WIDTH, false)).toBe(PRE_READY_MAX_WIDTH)
  })

  it("holds just short of a full bar instead of showing a stale 100% while not ready", () => {
    // This is the exact bug: the internal clock reaches a full bar (100) before the real work
    // (ready=false) is done. Before the fix this returned 100 and the bar would sit there,
    // unchanged, for however much longer the real work took.
    expect(displayBarWidth(100, false)).toBe(PRE_READY_MAX_WIDTH)
    expect(displayBarWidth(100, false)).toBeLessThan(100)
  })

  it("uncaps immediately once ready flips true, with no separate catch-up animation needed", () => {
    // Simulates the moment the real work finishes after the bar's own clock already maxed out.
    const rawWidthAfterClockFinished = 100
    expect(displayBarWidth(rawWidthAfterClockFinished, false)).toBe(PRE_READY_MAX_WIDTH)
    expect(displayBarWidth(rawWidthAfterClockFinished, true)).toBe(100)
  })
})
