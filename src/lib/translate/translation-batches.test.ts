import { describe, it, expect, vi } from "vitest"
import { buildSentencePages, splitSourceIntoSentences } from "@/lib/translate/page-split"
import {
  BatchedPageTranslator,
  BatchMisalignedError,
  assertBatchAligned,
  sliceItemsByNonWsRange,
} from "@/lib/translate/translation-batches"
import { pageSourceText } from "@/lib/translate/page-split"
import type { ReconciledItem } from "@/lib/translate/types"

/** Stand-in for translatePageText: one chunk per word, whitespace kept as text items. */
async function fakeTranslate(text: string): Promise<ReconciledItem[]> {
  return text
    .split(/(\s+)/)
    .filter((p) => p.length > 0)
    .map((p) =>
      /^\s+$/.test(p) ? { type: "text" as const, text: " " } : { type: "chunk" as const, chunk: p, meaning: `en:${p}` },
    )
}

const chunkWords = (items: ReconciledItem[]) =>
  items.flatMap((i) => (i.type === "chunk" ? [i.chunk] : i.type === "chapter" ? [`#${i.label}`] : []))

const SOURCE = Array.from(
  { length: 60 },
  (_, i) => `La frase número ${i + 1} cuenta algo sobre el pueblo y su gente.`,
).join(" ")

describe("sliceItemsByNonWsRange", () => {
  const items: ReconciledItem[] = [
    { type: "chunk", chunk: "Hola", meaning: "Hi" },
    { type: "text", text: " " },
    { type: "chunk", chunk: "mundo.", meaning: "world." },
    { type: "text", text: " " },
    { type: "chapter", label: "II" },
    { type: "chunk", chunk: "Adiós", meaning: "Bye" },
  ]

  it("keeps whole items inside the range and drops edge whitespace", () => {
    expect(sliceItemsByNonWsRange(items, 4, 10)).toEqual([{ type: "chunk", chunk: "mundo.", meaning: "world." }])
  })

  it("splits a chunk straddling a cut, keeping its gloss on both halves", () => {
    expect(sliceItemsByNonWsRange(items, 0, 2)).toEqual([{ type: "chunk", chunk: "Ho", meaning: "Hi" }])
    expect(sliceItemsByNonWsRange(items, 2, 4)).toEqual([{ type: "chunk", chunk: "la", meaning: "Hi" }])
  })

  it("puts a chapter heading on the side where it starts, never splitting it", () => {
    expect(chunkWords(sliceItemsByNonWsRange(items, 10, 17))).toEqual(["#II", "Adiós"])
    expect(chunkWords(sliceItemsByNonWsRange(items, 11, 17))).toEqual(["Adiós"])
  })
})

describe("assertBatchAligned", () => {
  it("rejects items that don't cover their source exactly", async () => {
    const items = await fakeTranslate("uno dos")
    expect(assertBatchAligned("uno dos", items)).toBe(items)
    expect(() => assertBatchAligned("uno dos tres", items)).toThrow(BatchMisalignedError)
  })
})

describe("BatchedPageTranslator", () => {
  const sents = splitSourceIntoSentences(SOURCE)

  /** Pages sized like two very different screens, sharing one "shared cache" of batches. */
  function setup(pageLimits: { maxWords: number; maxChars: number }, sharedCache: Map<string, ReconciledItem[]>) {
    const translateBatch = vi.fn(async (t: string) => {
      const hit = sharedCache.get(t)
      if (hit) return hit
      const items = await fakeTranslate(t)
      sharedCache.set(t, items)
      return items
    })
    const translateDirect = vi.fn(fakeTranslate)
    const pages = buildSentencePages(sents, pageLimits)
    const translator = BatchedPageTranslator.create(sents, pages, translateBatch, translateDirect)!
    return { pages, translator, translateBatch, translateDirect }
  }

  it("gives every page exactly its own words, on any page size", async () => {
    for (const limits of [
      { maxWords: 30, maxChars: 400 },
      { maxWords: 200, maxChars: 1800 },
    ]) {
      const { pages, translator, translateDirect } = setup(limits, new Map())
      for (const page of pages) {
        const text = pageSourceText(page)
        expect(chunkWords(await translator.translatePage(text))).toEqual(chunkWords(await fakeTranslate(text)))
      }
      expect(translateDirect).not.toHaveBeenCalled()
    }
  })

  it("lets a second reader on a different screen size reuse the first reader's batches", async () => {
    const shared = new Map<string, ReconciledItem[]>()
    const mobile = setup({ maxWords: 30, maxChars: 400 }, shared)
    for (const page of mobile.pages) await mobile.translator.translatePage(pageSourceText(page))
    const batchCount = shared.size

    const desktop = setup({ maxWords: 200, maxChars: 1800 }, shared)
    for (const page of desktop.pages) await desktop.translator.translatePage(pageSourceText(page))
    // No new batches: everything the desktop reader needed was already translated.
    expect(shared.size).toBe(batchCount)
  })

  it("translates each batch once per session even when several pages overlap it", async () => {
    const { pages, translator, translateBatch } = setup({ maxWords: 20, maxChars: 300 }, new Map())
    for (const page of pages) await translator.translatePage(pageSourceText(page))
    const batchTexts = translateBatch.mock.calls.map((c) => c[0])
    expect(new Set(batchTexts).size).toBe(batchTexts.length)
  })

  it("falls back to translating the page directly when a batch's translation doesn't line up", async () => {
    const pages = buildSentencePages(sents, { maxWords: 30, maxChars: 400 })
    const translateDirect = vi.fn(fakeTranslate)
    const translator = BatchedPageTranslator.create(
      sents,
      pages,
      async () => [{ type: "chunk", chunk: "basura", meaning: "junk" }],
      translateDirect,
    )!
    const text = pageSourceText(pages[0]!)
    expect(chunkWords(await translator.translatePage(text))).toEqual(chunkWords(await fakeTranslate(text)))
    expect(translateDirect).toHaveBeenCalledWith(text)
  })

  it("retries a batch that failed instead of remembering the failure", async () => {
    const pages = buildSentencePages(sents, { maxWords: 30, maxChars: 400 })
    let fail = true
    const translator = BatchedPageTranslator.create(
      sents,
      pages,
      async (t) => {
        if (fail) throw new Error("429 rate limited")
        return fakeTranslate(t)
      },
      fakeTranslate,
    )!
    const text = pageSourceText(pages[0]!)
    await expect(translator.translatePage(text)).rejects.toThrow("429")
    fail = false
    expect(chunkWords(await translator.translatePage(text))).toEqual(chunkWords(await fakeTranslate(text)))
  })

  it("isn't used when the pages don't cover the same text as the sentences", () => {
    expect(BatchedPageTranslator.create(sents, [["otra cosa"]], fakeTranslate, fakeTranslate)).toBeNull()
  })
})
