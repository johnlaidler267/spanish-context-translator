import { describe, it, expect } from "vitest"
import { stripStandaloneRomanChapterLines, insertChapterMarkers } from "@/lib/translate/roman-chapters"
import type { ReconciledItem } from "@/lib/translate/types"

describe("stripStandaloneRomanChapterLines", () => {
  it("leaves text with no standalone roman-numeral lines untouched", () => {
    const { stripped, markers } = stripStandaloneRomanChapterLines("Hola mundo.\nOtra línea.")
    expect(stripped).toBe("Hola mundo.\nOtra línea.")
    expect(markers).toEqual([])
  })

  it("strips a standalone roman-numeral line and records its position", () => {
    const { stripped, markers } = stripStandaloneRomanChapterLines("Line one\nII\nLine two")
    expect(stripped).toBe("Line one\nLine two")
    expect(markers).toEqual([{ insertAfterCanonIndex: 8, label: "II" }]) // "Line one".length === 8
  })

  it("records a marker at index 0 for a chapter heading at the very start", () => {
    const { stripped, markers } = stripStandaloneRomanChapterLines("I\nHola mundo")
    expect(stripped).toBe("Hola mundo")
    expect(markers).toEqual([{ insertAfterCanonIndex: 0, label: "I" }])
  })

  it("uppercases the label regardless of input case", () => {
    const { markers } = stripStandaloneRomanChapterLines("iv\nBody text")
    expect(markers[0]!.label).toBe("IV")
  })

  it("does not treat a partial-line roman numeral as a chapter heading", () => {
    const { stripped, markers } = stripStandaloneRomanChapterLines("Chapter II: Begins")
    expect(stripped).toBe("Chapter II: Begins")
    expect(markers).toEqual([])
  })

  it("handles consecutive chapter-heading lines at the same body position", () => {
    const { stripped, markers } = stripStandaloneRomanChapterLines("I\nII\nText")
    expect(stripped).toBe("Text")
    expect(markers).toEqual([
      { insertAfterCanonIndex: 0, label: "I" },
      { insertAfterCanonIndex: 0, label: "II" },
    ])
  })
})

describe("insertChapterMarkers", () => {
  it("returns the items unchanged when there are no markers", () => {
    const items: ReconciledItem[] = [{ type: "text", text: "Hola" }]
    expect(insertChapterMarkers(items, [])).toBe(items)
  })

  it("inserts a chapter marker cleanly between two items when the offset lands on a boundary", () => {
    const items: ReconciledItem[] = [
      { type: "text", text: "Hola " },
      { type: "chunk", chunk: "mundo", meaning: "world" },
    ]
    const result = insertChapterMarkers(items, [{ insertAfterCanonIndex: 5, label: "I" }])
    expect(result).toEqual([
      { type: "text", text: "Hola " },
      { type: "chapter", label: "I" },
      { type: "chunk", chunk: "mundo", meaning: "world", literal: undefined, note: undefined },
    ])
  })

  it("splits a chunk item in two when a marker falls in the middle of it", () => {
    const items: ReconciledItem[] = [
      { type: "chunk", chunk: "HolaMundo", meaning: "hi world" },
    ]
    const result = insertChapterMarkers(items, [{ insertAfterCanonIndex: 4, label: "I" }])
    expect(result).toEqual([
      { type: "chunk", chunk: "Hola", meaning: "hi world", literal: undefined, note: undefined },
      { type: "chapter", label: "I" },
      { type: "chunk", chunk: "Mundo", meaning: "hi world", literal: undefined, note: undefined },
    ])
  })

  it("inserts multiple markers at their respective positions, in order", () => {
    const items: ReconciledItem[] = [{ type: "text", text: "AAABBBCCC" }]
    const result = insertChapterMarkers(items, [
      { insertAfterCanonIndex: 6, label: "II" },
      { insertAfterCanonIndex: 3, label: "I" },
    ])
    expect(result).toEqual([
      { type: "text", text: "AAA" },
      { type: "chapter", label: "I" },
      { type: "text", text: "BBB" },
      { type: "chapter", label: "II" },
      { type: "text", text: "CCC" },
    ])
  })

  it("leaves existing chapter items in the stream untouched", () => {
    const items: ReconciledItem[] = [
      { type: "chapter", label: "PROLOGUE" },
      { type: "text", text: "Hola" },
    ]
    const result = insertChapterMarkers(items, [{ insertAfterCanonIndex: 4, label: "I" }])
    expect(result).toEqual([
      { type: "chapter", label: "PROLOGUE" },
      { type: "text", text: "Hola" },
      { type: "chapter", label: "I" },
    ])
  })
})
