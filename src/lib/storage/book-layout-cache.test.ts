import { describe, expect, it } from "vitest"
import { bookLayoutSignature, layoutFitsBox } from "@/lib/storage/book-layout-cache"

const sig = bookLayoutSignature({ isMobile: true, widthPx: 342, maxWords: 120, maxChars: 700 })

describe("layoutFitsBox", () => {
  it("reuses a layout built for the same box", () => {
    expect(layoutFitsBox({ signature: sig, heightPx: 600 }, { signature: sig, heightPx: 600 })).toBe(true)
  })

  it("reuses a layout built for a slightly shorter box (mobile address bar hidden now)", () => {
    expect(layoutFitsBox({ signature: sig, heightPx: 600 }, { signature: sig, heightPx: 660 })).toBe(true)
  })

  it("never reuses a layout built for a taller box -- its pages could overflow", () => {
    expect(layoutFitsBox({ signature: sig, heightPx: 660 }, { signature: sig, heightPx: 600 })).toBe(false)
  })

  it("misses when the box is much taller (pages would end far too early)", () => {
    expect(layoutFitsBox({ signature: sig, heightPx: 600 }, { signature: sig, heightPx: 900 })).toBe(false)
  })

  it("misses on any change in width, mode, or page-size limits", () => {
    const saved = { signature: sig, heightPx: 600 }
    for (const other of [
      bookLayoutSignature({ isMobile: true, widthPx: 390, maxWords: 120, maxChars: 700 }),
      bookLayoutSignature({ isMobile: false, widthPx: 342, maxWords: 120, maxChars: 700 }),
      bookLayoutSignature({ isMobile: true, widthPx: 342, maxWords: 110, maxChars: 700 }),
    ]) {
      expect(layoutFitsBox(saved, { signature: other, heightPx: 600 })).toBe(false)
    }
  })

  it("stamps the pagination code version into the signature", () => {
    expect(sig.startsWith(`${__PAGINATION_SOURCE_HASH__}|`)).toBe(true)
    expect(__PAGINATION_SOURCE_HASH__).toMatch(/^[0-9a-f]{16}$/)
  })
})
