import { buildSentencePages, pageSourceText } from "@/lib/translate/page-split"
import { LLM_CHUNK_INPUT_CHAR_CAP } from "@/lib/translate/llm-settings"
import type { PageSplitLimits, ReconciledItem } from "@/lib/translate/types"

/**
 * Fixed, viewport-independent unit of translation for content in the shared translation cache
 * (see shared-translation-cache.ts): one LLM call and one cache row each.
 *
 * Why this exists: on-screen pages are sized to each reader's real window (see
 * reflowPagesForRealFit), so two readers almost never get identical pages -- a cache keyed on
 * page text would rarely hit across users. Batches are instead cut from the whole text with
 * fixed limits, so every reader on every device gets the same batches (and the same cache keys).
 * Each on-screen page then shows the slice of its overlapping batches' translated items that
 * covers exactly its own text (see {@link BatchedPageTranslator}), so page fill is unaffected.
 *
 * Changing these limits changes every batch boundary, i.e. orphans every existing shared-cache
 * row -- only do it deliberately.
 */
export const TRANSLATION_BATCH_LIMITS: PageSplitLimits = {
  maxWords: 120,
  maxChars: LLM_CHUNK_INPUT_CHAR_CAP,
}

/** Count of non-whitespace characters. Alignment between source text and translated items is
 *  done in this space because translation collapses/normalizes whitespace but never drops or
 *  adds visible characters (see reconcileChunks / insertChapterMarkers). */
export function nonWsLength(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) if (!/\s/.test(s[i]!)) n++
  return n
}

function itemText(item: ReconciledItem): string {
  if (item.type === "chunk") return item.chunk
  if (item.type === "text") return item.text
  return item.label
}

export function itemsNonWsLength(items: ReconciledItem[]): number {
  let n = 0
  for (const item of items) n += nonWsLength(itemText(item))
  return n
}

/** String index at which the `k`-th (0-based) non-whitespace char of `s` sits; `s.length` when
 *  `s` has no more than `k` of them. */
function indexOfNonWs(s: string, k: number): number {
  let seen = 0
  for (let i = 0; i < s.length; i++) {
    if (/\s/.test(s[i]!)) continue
    if (seen === k) return i
    seen++
  }
  return s.length
}

/**
 * The part of `items` covering non-whitespace positions `[start, end)` of the text they were
 * translated from. A chunk straddling a cut is split there, keeping its gloss on both halves --
 * the same treatment insertChapterMarkers gives a chunk a chapter line lands inside. Whitespace
 * only items are kept between the cuts and dropped at them, so a slice never starts or ends on a
 * dangling gap.
 */
export function sliceItemsByNonWsRange(
  items: ReconciledItem[],
  start: number,
  end: number,
): ReconciledItem[] {
  const out: ReconciledItem[] = []
  let pos = 0
  for (const item of items) {
    const text = itemText(item)
    const n = nonWsLength(text)
    const itemStart = pos
    const itemEnd = pos + n
    pos = itemEnd
    if (n === 0) {
      if (itemStart > start && itemStart < end) out.push(item)
      continue
    }
    if (itemEnd <= start || itemStart >= end) continue
    if (item.type === "chapter" || (itemStart >= start && itemEnd <= end)) {
      // A chapter heading is never split -- it goes wherever it starts.
      if (item.type !== "chapter" || itemStart >= start) out.push(item)
      continue
    }
    const from = itemStart < start ? indexOfNonWs(text, start - itemStart) : 0
    const to = itemEnd > end ? indexOfNonWs(text, end - itemStart) : text.length
    const piece = text.slice(from, to)
    out.push(item.type === "chunk" ? { ...item, chunk: piece } : { type: "text", text: piece })
  }
  return out
}

/** Thrown when a batch's translated items don't cover its source text exactly, so they can't
 *  be sliced onto pages safely. Also keeps the result out of the shared cache (see
 *  shared-translation-cache.ts, which only stores successful translations). */
export class BatchMisalignedError extends Error {
  constructor() {
    super("Translated batch does not line up with its source text.")
    this.name = "BatchMisalignedError"
  }
}

/** Throws {@link BatchMisalignedError} unless `items` cover `text` exactly -- run on every fresh
 *  batch translation *before* it's written to the shared cache, and on every cached row read. */
export function assertBatchAligned(text: string, items: ReconciledItem[]): ReconciledItem[] {
  if (itemsNonWsLength(items) !== nonWsLength(text)) throw new BatchMisalignedError()
  return items
}

type Range = { start: number; end: number }

function cumulativeRanges(texts: string[]): Range[] {
  let pos = 0
  return texts.map((t) => {
    const start = pos
    pos += nonWsLength(t)
    return { start, end: pos }
  })
}

/**
 * Turns "translate this on-screen page" into "translate (or fetch) the fixed batches this page
 * overlaps, then slice out the page's own part" -- see {@link TRANSLATION_BATCH_LIMITS}.
 * Plugs into TranslationCache as its per-page translate function, so paging, retries, and the
 * per-device localStorage cache all work unchanged on top of it.
 *
 * Falls back to translating the page directly (no sharing) whenever alignment can't be trusted:
 * the page text isn't one this translator was built for, or a batch's translation doesn't
 * cover its source exactly.
 */
export class BatchedPageTranslator {
  private readonly batchTexts: string[]
  private readonly batchRanges: Range[]
  private readonly pageRangeByText = new Map<string, Range>()
  private readonly batchResults = new Map<number, Promise<ReconciledItem[]>>()

  private constructor(
    batchTexts: string[],
    pageTexts: string[],
    private readonly translateBatch: (text: string) => Promise<ReconciledItem[]>,
    private readonly translatePageDirect: (text: string) => Promise<ReconciledItem[]>,
  ) {
    this.batchTexts = batchTexts
    this.batchRanges = cumulativeRanges(batchTexts)
    const pageRanges = cumulativeRanges(pageTexts)
    pageTexts.forEach((t, i) => {
      if (!this.pageRangeByText.has(t)) this.pageRangeByText.set(t, pageRanges[i]!)
    })
  }

  /**
   * `sentences` is the full text's sentence list (viewport-independent) and `pages` this
   * reader's on-screen pages built from it. Returns null when the two don't cover the same text
   * (so batch offsets wouldn't line up with page offsets) -- the caller then just translates
   * page by page as before.
   */
  static create(
    sentences: string[],
    pages: string[][],
    translateBatch: (text: string) => Promise<ReconciledItem[]>,
    translatePageDirect: (text: string) => Promise<ReconciledItem[]>,
  ): BatchedPageTranslator | null {
    const batchTexts = buildSentencePages(sentences, TRANSLATION_BATCH_LIMITS).map(pageSourceText)
    const pageTexts = pages.map(pageSourceText)
    const total = (texts: string[]) => texts.reduce((n, t) => n + nonWsLength(t), 0)
    if (batchTexts.length === 0 || total(batchTexts) !== total(pageTexts)) return null
    return new BatchedPageTranslator(batchTexts, pageTexts, translateBatch, translatePageDirect)
  }

  /** Same contract as translatePageText: source text of one on-screen page in, its items out. */
  translatePage = async (pageText: string): Promise<ReconciledItem[]> => {
    const range = this.pageRangeByText.get(pageText)
    if (!range || range.end === range.start) return this.translatePageDirect(pageText)

    const overlapping: number[] = []
    this.batchRanges.forEach((b, i) => {
      if (b.end > range.start && b.start < range.end) overlapping.push(i)
    })

    let batchItems: ReconciledItem[][]
    try {
      batchItems = await Promise.all(overlapping.map((i) => this.loadBatch(i)))
    } catch (e) {
      if (e instanceof BatchMisalignedError) return this.translatePageDirect(pageText)
      throw e
    }

    const out: ReconciledItem[] = []
    overlapping.forEach((b, k) => {
      const br = this.batchRanges[b]!
      const from = Math.max(range.start, br.start) - br.start
      const to = Math.min(range.end, br.end) - br.start
      out.push(...sliceItemsByNonWsRange(batchItems[k]!, from, to))
    })
    return out
  }

  /** One translation per batch per session, shared by every page that overlaps it. A failure is
   *  forgotten so the page's retry (TranslationCache.clearPage + loadPage) tries it again. */
  private loadBatch(index: number): Promise<ReconciledItem[]> {
    const existing = this.batchResults.get(index)
    if (existing) return existing
    const text = this.batchTexts[index]!
    const p = this.translateBatch(text).then((items) => assertBatchAligned(text, items))
    p.catch(() => this.batchResults.delete(index))
    this.batchResults.set(index, p)
    return p
  }
}
