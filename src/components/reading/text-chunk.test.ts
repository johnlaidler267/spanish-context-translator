import { describe, it, expect } from "vitest"
import { isPunctuationOnly, shouldGlueAfterPriorChunk } from "@/components/reading/text-chunk"

// These two determine which chunks hit TextChunk's early-return path (see
// the Rules of Hooks fix) — worth pinning down precisely.
describe("isPunctuationOnly", () => {
  it("is true for punctuation-only chunks", () => {
    expect(isPunctuationOnly(",")).toBe(true)
    expect(isPunctuationOnly(".")).toBe(true)
    expect(isPunctuationOnly("¿")).toBe(true)
    expect(isPunctuationOnly("...")).toBe(true)
    expect(isPunctuationOnly("  ,  ")).toBe(true) // surrounding whitespace trimmed first
  })

  it("is false for real words, including accented Spanish letters", () => {
    expect(isPunctuationOnly("hola")).toBe(false)
    expect(isPunctuationOnly("días")).toBe(false)
    expect(isPunctuationOnly("año")).toBe(false)
  })

  it("is false for whitespace-only or empty text (handled by a separate check)", () => {
    expect(isPunctuationOnly("   ")).toBe(false)
    expect(isPunctuationOnly("")).toBe(false)
  })
})

describe("shouldGlueAfterPriorChunk", () => {
  it("glues closing punctuation flush against the prior word (\"word ,\" -> \"word,\")", () => {
    expect(shouldGlueAfterPriorChunk(",")).toBe(true)
    expect(shouldGlueAfterPriorChunk(".")).toBe(true)
  })

  it("does not glue opening punctuation — it belongs with the next word", () => {
    expect(shouldGlueAfterPriorChunk("¿")).toBe(false)
    expect(shouldGlueAfterPriorChunk("¡")).toBe(false)
    expect(shouldGlueAfterPriorChunk("(")).toBe(false)
  })

  it("does not glue real words", () => {
    expect(shouldGlueAfterPriorChunk("hola")).toBe(false)
  })
})
