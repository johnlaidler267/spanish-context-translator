import { describe, it, expect } from "vitest"
import { parsePageJumpInput, clampPageNumber, resolvePageJumpTarget } from "@/lib/reading/page-jump"

describe("parsePageJumpInput", () => {
  it("parses plain digit strings", () => {
    expect(parsePageJumpInput("42")).toBe(42)
    expect(parsePageJumpInput("1")).toBe(1)
  })

  it("strips non-numeric characters before parsing", () => {
    expect(parsePageJumpInput(" 12 ")).toBe(12)
    expect(parsePageJumpInput("p12")).toBe(12)
    expect(parsePageJumpInput("1.5")).toBe(15) // '.' stripped, not treated as decimal
  })

  it("returns null for empty, zero, or non-numeric input", () => {
    expect(parsePageJumpInput("")).toBeNull()
    expect(parsePageJumpInput("   ")).toBeNull()
    expect(parsePageJumpInput("0")).toBeNull()
    expect(parsePageJumpInput("abc")).toBeNull()
  })

  it("strips a leading minus sign along with any other non-digit character (never a negative result)", () => {
    // The real input field only ever accepts digits (see article-content.tsx), so this can't
    // happen via the UI — documenting it here so the "ignore anything non-numeric" contract is
    // pinned down for whatever calls this directly.
    expect(parsePageJumpInput("-5")).toBe(5)
  })
})

describe("clampPageNumber", () => {
  it("passes through in-range values", () => {
    expect(clampPageNumber(5, 10)).toBe(5)
  })

  it("clamps below 1 up to 1", () => {
    expect(clampPageNumber(0, 10)).toBe(1)
    expect(clampPageNumber(-3, 10)).toBe(1)
  })

  it("clamps above pageCount down to pageCount", () => {
    expect(clampPageNumber(999, 10)).toBe(10)
  })

  it("treats a zero/negative pageCount as a single page", () => {
    expect(clampPageNumber(5, 0)).toBe(1)
  })
})

describe("resolvePageJumpTarget", () => {
  it("resolves valid input clamped to the page count", () => {
    expect(resolvePageJumpTarget("500", 20)).toBe(20)
    expect(resolvePageJumpTarget("7", 20)).toBe(7)
  })

  it("returns null (no navigation) for unparsable input", () => {
    expect(resolvePageJumpTarget("", 20)).toBeNull()
    expect(resolvePageJumpTarget("abc", 20)).toBeNull()
    expect(resolvePageJumpTarget("0", 20)).toBeNull()
  })
})
