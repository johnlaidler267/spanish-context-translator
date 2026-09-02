import { describe, it, expect } from "vitest"
import {
  gapBetweenReconciledChunks,
  normalizeChunkingSource,
  shouldGlueAfterPriorChunkReadGlue,
  coalesceGlueablePunctuationChunks,
  coalesceGlueablePunctuationReconciledItems,
  reconcileChunks,
} from "@/lib/translate/chunk-reconcile"
import type { RawChunk, ReconciledChunk, ReconciledItem } from "@/lib/translate/types"

const chunk = (text: string): ReconciledChunk => ({ type: "chunk", chunk: text, meaning: "" })

describe("gapBetweenReconciledChunks", () => {
  it("inserts a space between two word-ending/word-starting chunks glued with no gap between them", () => {
    expect(gapBetweenReconciledChunks(chunk("hola"), chunk("mundo"))).toBe(" ")
  })

  it("adds nothing when the prior chunk already ends in whitespace", () => {
    expect(gapBetweenReconciledChunks(chunk("hola "), chunk("mundo"))).toBe("")
  })

  it("adds nothing when the next chunk already starts with whitespace", () => {
    expect(gapBetweenReconciledChunks(chunk("hola"), chunk(" mundo"))).toBe("")
  })

  it("adds nothing when either edge is punctuation, not a word character", () => {
    expect(gapBetweenReconciledChunks(chunk("hola"), chunk(",mundo"))).toBe("")
    expect(gapBetweenReconciledChunks(chunk("hola."), chunk("mundo"))).toBe("")
  })
})

describe("normalizeChunkingSource", () => {
  it("collapses horizontal whitespace but preserves newlines", () => {
    expect(normalizeChunkingSource("Hola   mundo\n\nOtra   línea")).toBe("Hola mundo\n\nOtra línea")
  })

  it("trims leading/trailing whitespace including newlines", () => {
    expect(normalizeChunkingSource("  Hola\n")).toBe("Hola")
  })
})

describe("shouldGlueAfterPriorChunkReadGlue", () => {
  it("glues closing punctuation to the prior word", () => {
    expect(shouldGlueAfterPriorChunkReadGlue(",")).toBe(true)
    expect(shouldGlueAfterPriorChunkReadGlue(".")).toBe(true)
  })

  it("does not glue opening punctuation", () => {
    expect(shouldGlueAfterPriorChunkReadGlue("¿")).toBe(false)
    expect(shouldGlueAfterPriorChunkReadGlue("(")).toBe(false)
  })

  it("does not glue real words", () => {
    expect(shouldGlueAfterPriorChunkReadGlue("hola")).toBe(false)
  })
})

describe("coalesceGlueablePunctuationChunks", () => {
  it("returns the array unchanged when there's 0 or 1 chunk", () => {
    const single = [{ text: "Hola" }]
    expect(coalesceGlueablePunctuationChunks(single)).toBe(single)
    expect(coalesceGlueablePunctuationChunks([])).toEqual([])
  })

  it("merges a trailing closing-punctuation chunk into the previous one", () => {
    const result = coalesceGlueablePunctuationChunks([
      { text: "Hola" },
      { text: "," },
      { text: "mundo" },
    ])
    expect(result).toEqual([{ text: "Hola," }, { text: "mundo" }])
  })

  it("keeps opening punctuation as its own separate chunk", () => {
    const result = coalesceGlueablePunctuationChunks([
      { text: "Hola" },
      { text: "¿" },
      { text: "Cómo" },
    ])
    expect(result).toEqual([{ text: "Hola" }, { text: "¿" }, { text: "Cómo" }])
  })
})

describe("reconcileChunks", () => {
  it("aligns straightforward chunks against the source with no gaps or duplication", () => {
    const chunks: RawChunk[] = [
      { chunk: "Hola", meaning: "hi" },
      { chunk: "mundo", meaning: "world" },
    ]
    expect(reconcileChunks(chunks, "Hola mundo")).toEqual([
      { type: "chunk", chunk: "Hola", meaning: "hi" },
      { type: "text", text: " " },
      { type: "chunk", chunk: "mundo", meaning: "world" },
    ])
  })

  // Regression: irregularly-formatted source (short "sentence per line" pastes, an awkward
  // mid-phrase line break with no blank line) makes the model reflow that `\n` into a plain
  // space when it emits a chunk's Spanish text. Before the fix, findChunkSpanInSource required
  // a byte-exact match, so this chunk failed to match, `pos` never advanced past it, and the
  // next chunk's successful forward match then gap-filled the same original span a second
  // time — producing "la provincia de Zaragoza la provincia de Zaragoza" in the reported bug.
  it("does not duplicate text when a chunk's span reflows a source line break into a space", () => {
    const original = "en medio de\nla provincia de Zaragoza, no lejos de Sos."
    const chunks: RawChunk[] = [
      { chunk: "en medio de la provincia de Zaragoza", meaning: "in the middle of the province of Zaragoza" },
      { chunk: ", no lejos de Sos.", meaning: "not far from Sos." },
    ]
    const result = reconcileChunks(chunks, original)
    const rendered = result
      .map((it) => (it.type === "text" ? it.text : it.type === "chapter" ? it.label : it.chunk))
      .join("")
    expect(rendered).toBe(original)
    // The whitespace-tolerant match resolves to the real source span, `\n` intact — not the
    // model's reflowed text — so `pos` lands in the right place for the next chunk.
    expect(result).toEqual([
      {
        type: "chunk",
        chunk: "en medio de\nla provincia de Zaragoza",
        meaning: "in the middle of the province of Zaragoza",
      },
      { type: "chunk", chunk: ", no lejos de Sos.", meaning: "not far from Sos." },
    ])
  })
})

describe("coalesceGlueablePunctuationReconciledItems", () => {
  it("merges a punctuation-only chunk row into the previous chunk", () => {
    const items: ReconciledItem[] = [
      { type: "chunk", chunk: "Hola", meaning: "hi" },
      { type: "chunk", chunk: ",", meaning: "" },
      { type: "chunk", chunk: "mundo", meaning: "world" },
    ]
    expect(coalesceGlueablePunctuationReconciledItems(items)).toEqual([
      { type: "chunk", chunk: "Hola,", meaning: "hi", literal: undefined, note: undefined },
      { type: "chunk", chunk: "mundo", meaning: "world", literal: undefined, note: undefined },
    ])
  })

  it("absorbs a punctuation-only text gap between two chunks into the previous chunk", () => {
    const items: ReconciledItem[] = [
      { type: "chunk", chunk: "Hola", meaning: "hi" },
      { type: "text", text: " , " },
      { type: "chunk", chunk: "mundo", meaning: "world" },
    ]
    expect(coalesceGlueablePunctuationReconciledItems(items)).toEqual([
      { type: "chunk", chunk: "Hola , ", meaning: "hi", literal: undefined, note: undefined },
      { type: "chunk", chunk: "mundo", meaning: "world", literal: undefined, note: undefined },
    ])
  })

  it("does not glue across a chapter marker — it resets the merge chain", () => {
    const items: ReconciledItem[] = [
      { type: "chunk", chunk: "Hola", meaning: "hi" },
      { type: "chapter", label: "I" },
      { type: "chunk", chunk: "mundo", meaning: "world" },
    ]
    expect(coalesceGlueablePunctuationReconciledItems(items)).toEqual([
      { type: "chunk", chunk: "Hola", meaning: "hi", literal: undefined, note: undefined },
      { type: "chapter", label: "I" },
      { type: "chunk", chunk: "mundo", meaning: "world", literal: undefined, note: undefined },
    ])
  })
})
