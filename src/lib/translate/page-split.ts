import { collapseHorizontalWsOnly } from "@/lib/translate/text-ws"
import type { PageSplitLimits } from "@/lib/translate/types"

/**
 * Fallback words per LLM page when DOM measurement is unavailable (SSR / tiny viewport).
 * Normal path: `reading-page-measure` + `resolvePageSplitLimits` in the app shell.
 */
export const PAGE_SIZE_WORDS_MOBILE = 68
export const PAGE_SIZE_WORDS_DESKTOP = 115

/** Secondary cap (chars) so one very long sentence doesn’t dominate a page. */
export function pageCharCapForWordLimit(maxWords: number): number {
  return Math.round(maxWords * 24)
}

/** Static fallback if DOM-based `measureArticlePageSplitLimits` cannot run yet. */
export function resolvePageSplitLimits(isMobileViewport: boolean): PageSplitLimits {
  const maxWords = isMobileViewport ? PAGE_SIZE_WORDS_MOBILE : PAGE_SIZE_WORDS_DESKTOP
  return { maxWords, maxChars: pageCharCapForWordLimit(maxWords) }
}

function countWordsInSentence(s: string): number {
  return s.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length
}

/**
 * Drop consecutive lines that are the same after collapsing internal whitespace and trimming.
 * Many PDF/ebook copies duplicate each line; once newlines become spaces the source repeats
 * whole phrases (`...Pastora Había nacido...`). The model chunks a single narrative stream, so
 * {@link reconcileChunks} would jump with `indexOf` and leave huge plain-text gaps.
 */
export function dedupeConsecutiveDuplicateLines(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let prevKey = ""
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").trim()
    if (key !== "" && key === prevKey) continue
    out.push(line)
    prevKey = key === "" ? "" : key
  }
  return out.join("\n")
}

/**
 * Lyrics, poems, and tagged song text: many physical lines but few sentence-ending punctuators.
 * Sentence segmentation would strip line boundaries; keep line structure intact so newlines
 * survive paging. Also drives the verse-style rendering in ArticleContent (`whitespace-pre-line`,
 * no paragraph indent) — reused there so lyrics/poems are detected the same way in both places.
 */
export function looksLikeLineBreakHeavySource(t: string): boolean {
  const rawLines = t.split(/\r?\n/)
  if (rawLines.length < 2) return false
  const lines = rawLines.filter((l) => l.trim().length > 0)
  if (lines.length === 0) return false
  const terminals = (t.match(/[.!?…]/g) ?? []).length
  if (lines.length >= 3) return terminals < lines.length * 0.45
  return lines.length >= 2 && terminals < 2
}

/**
 * Split source Spanish into sentences without cutting mid-sentence.
 * Uses `Intl.Segmenter` when available (es).
 */
export function splitSourceIntoSentences(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  if (looksLikeLineBreakHeavySource(t)) {
    return [t]
  }
  try {
    const Seg = (
      Intl as unknown as {
        Segmenter?: new (locales: string, options: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> }
      }
    ).Segmenter
    if (Seg) {
      const seg = new Seg("es", { granularity: "sentence" })
      return [...seg.segment(t)]
        .map((x) => x.segment.trim())
        .filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  return t
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

function isNewlineOnlyToken(tok: string): boolean {
  return /^\n+$/.test(tok)
}

/**
 * Flat stream of word-ish tokens and newline runs (`\n`, `\n\n`, …) in source order.
 */
function tokenizeSourceForPageSplitting(text: string): string[] {
  const t = collapseHorizontalWsOnly(text)
  if (!t) return []
  const out: string[] = []
  for (const seg of t.split(/(\n+)/)) {
    if (!seg) continue
    if (isNewlineOnlyToken(seg)) {
      out.push(seg)
      continue
    }
    const line = seg.trim()
    if (!line) continue
    const punctPieces = line.split(/(?<=[,;:])\s+/u).map((s) => s.trim()).filter(Boolean)
    const sub =
      punctPieces.length > 1 ? punctPieces : line.split(/\s+/u).filter(Boolean)
    out.push(...sub)
  }
  return out
}

function appendTokenToRun(run: string, token: string): string {
  if (!run) return token
  if (isNewlineOnlyToken(token)) return run + token
  if (/\n$/.test(run)) return run + token
  return `${run} ${token}`
}

/** A blank line (2+ consecutive newlines) — the natural place to break a poem/song, if one is available. */
function isStanzaBoundaryToken(token: string): boolean {
  return isNewlineOnlyToken(token) && token.length >= 2
}

/** Rebuild a run's text from its tokens (mirrors the incremental `appendTokenToRun` folding). */
function joinTokens(tokens: string[]): string {
  let out = ""
  for (const t of tokens) out = appendTokenToRun(out, t)
  return out
}

function wordsInTokens(tokens: string[]): number {
  return tokens.reduce((n, t) => n + (isNewlineOnlyToken(t) ? 0 : countWordsInSentence(t)), 0)
}

/**
 * Break one long segment into smaller parts so no single unit can exceed page limits.
 * This prevents mobile overflow when a long intro contains one very long sentence.
 * Preserves newline characters so verse/lyrics are not flattened to a single paragraph before translate.
 *
 * For poems/songs (many blank-line stanza breaks, few sentence terminators — see
 * `looksLikeLineBreakHeavySource`), a forced cut prefers the most recent stanza boundary within
 * the current run over the exact token that hit the budget, so a page break lands between verses
 * instead of mid-stanza whenever one is available.
 */
export function splitSegmentIntoPageParts(text: string, limits: PageSplitLimits): string[] {
  const tokenStream = tokenizeSourceForPageSplitting(text)
  if (tokenStream.length === 0) return []

  const parts: string[] = []
  let run = ""
  let runWords = 0
  let runChars = 0
  /** Tokens composing `run`, so a forced cut can roll back to the last stanza boundary. */
  let runTokens: string[] = []
  /** Index into `runTokens` of the most recent stanza-boundary token, if any. */
  let stanzaBoundaryIdx: number | null = null

  for (const token of tokenStream) {
    const tokenWords = isNewlineOnlyToken(token) ? 0 : countWordsInSentence(token)
    const tokenChars = token.length
    const candidate = appendTokenToRun(run, token)
    const charGain = candidate.length - run.length
    const nextWords = runWords + tokenWords
    const nextChars = runChars + charGain

    if (run && (nextWords > limits.maxWords || nextChars > limits.maxChars)) {
      if (stanzaBoundaryIdx !== null) {
        parts.push(joinTokens(runTokens.slice(0, stanzaBoundaryIdx + 1)))
        const remainder = runTokens.slice(stanzaBoundaryIdx + 1)
        run = joinTokens(remainder)
        runWords = wordsInTokens(remainder)
        runChars = run.length
        runTokens = remainder
        const idx = remainder.findLastIndex(isStanzaBoundaryToken)
        stanzaBoundaryIdx = idx === -1 ? null : idx
      } else {
        parts.push(run)
        run = ""
        runWords = 0
        runChars = 0
        runTokens = []
        stanzaBoundaryIdx = null
      }
    }

    if (
      !run &&
      !isNewlineOnlyToken(token) &&
      (tokenWords > limits.maxWords || tokenChars > limits.maxChars)
    ) {
      const words = token.split(/\s+/u).filter(Boolean)
      let wordRun = ""
      let wordRunWords = 0
      let wordRunChars = 0
      for (const w of words) {
        const wWords = countWordsInSentence(w)
        const wChars = w.length
        const wSep = wordRun ? 1 : 0
        if (
          wordRun &&
          (wordRunWords + wWords > limits.maxWords || wordRunChars + wSep + wChars > limits.maxChars)
        ) {
          parts.push(wordRun)
          wordRun = ""
          wordRunWords = 0
          wordRunChars = 0
        }
        wordRun += (wordRun ? " " : "") + w
        wordRunWords += wWords
        wordRunChars += wChars + (wordRunChars > 0 ? 1 : 0)
      }
      if (wordRun) parts.push(wordRun)
      continue
    }

    run = appendTokenToRun(run, token)
    runWords += tokenWords
    runChars = run.length
    runTokens.push(token)
    if (isStanzaBoundaryToken(token)) stanzaBoundaryIdx = runTokens.length - 1
  }

  if (run) parts.push(run)
  return parts
}

/**
 * Group source text into pages; sentences may be split into smaller pieces if needed.
 * Page breaks are driven by `maxChars` first when limits come from DOM measurement (large `maxWords`).
 */
export function buildSentencePages(sentences: string[], limits: PageSplitLimits): string[][] {
  if (sentences.length === 0) return []
  const { maxWords: PAGE_SIZE_WORDS, maxChars: PAGE_SIZE_CHARS } = limits
  const pieces: string[] = []
  for (const sent of sentences) {
    pieces.push(...splitSegmentIntoPageParts(sent, limits))
  }

  const pages: string[][] = []
  let cur: string[] = []
  let words = 0
  let chars = 0

  for (const sent of pieces) {
    const w = countWordsInSentence(sent)
    const c = sent.length
    const prevPiece = cur.length > 0 ? cur[cur.length - 1]! : ""
    const sep = cur.length > 0 ? pagePieceJoinGapChars(prevPiece, sent) : 0
    if (
      cur.length > 0 &&
      (words + w > PAGE_SIZE_WORDS || chars + sep + c > PAGE_SIZE_CHARS)
    ) {
      pages.push(cur)
      cur = []
      words = 0
      chars = 0
    }
    cur.push(sent)
    words += w
    chars += c + sep
  }
  if (cur.length) pages.push(cur)
  return pages
}

/** Char budget when packing {@link buildSentencePages} — mirrors {@link pageSourceText} join rules. */
function pagePieceJoinGapChars(prev: string, next: string): number {
  if (!prev || !next) return 0
  if (/\s$/.test(prev) || /^\s/.test(next)) return 0
  if (/\n$/.test(prev) || /^\n/.test(next)) return 0
  return 1
}

/** Words shown in the "Where you left off" resume excerpt — see {@link resumeExcerptFromPageSource}. */
const RESUME_EXCERPT_MAX_WORDS = 16

/**
 * First ~16 words of a resumed page's own raw source text — the snippet shown in the
 * "Where you left off" modal (see where-you-left-off-modal.tsx) when a book is reopened partway
 * through. Deliberately a verbatim excerpt rather than an LLM-generated summary: the page this
 * pulls from is already split out client-side with zero network calls the moment a book is
 * opened (see `pages`/`initialPageIndex` in App.tsx's `handleTextSubmit`), so this reuses text
 * the app already has in hand instead of paying for a summarization call every time a book is
 * reopened.
 */
export function resumeExcerptFromPageSource(pageSentences: string[]): string {
  const text = collapseHorizontalWsOnly(pageSourceText(pageSentences)).replace(/\s+/g, " ").trim()
  if (!text) return ""
  const words = text.split(" ").filter(Boolean)
  if (words.length <= RESUME_EXCERPT_MAX_WORDS) return words.join(" ")
  return `${words.slice(0, RESUME_EXCERPT_MAX_WORDS).join(" ")}…`
}

/**
 * Rejoin page fragments in order. Uses a space only when the boundary would otherwise
 * glue two words (prose); skips extra spaces across newlines or existing whitespace.
 */
export function pageSourceText(pageSentences: string[]): string {
  if (pageSentences.length === 0) return ""
  let out = pageSentences[0]!
  for (let i = 1; i < pageSentences.length; i++) {
    const next = pageSentences[i]!
    const gap = pagePieceJoinGapChars(out, next)
    out += (gap ? " " : "") + next
  }
  return out
}

/**
 * For each page, the index into `sentences` (the original, viewport-independent array from
 * {@link splitSourceIntoSentences}) that the page's content starts in or continues from.
 *
 * This is the cross-device resume anchor (see reading-progress-storage.ts): a raw page index
 * means a different spot in the book on every device, since pagination is driven by how much
 * text fits that device's viewport (see reading-page-measure.ts) — mobile fits far fewer words
 * per page than desktop. A sentence index means the same thing everywhere, because it's derived
 * only from the source text.
 *
 * Matches pages to sentences by cumulative **word count** rather than character offset: pages
 * are built from `sentences` via {@link splitSegmentIntoPageParts}, which collapses horizontal
 * whitespace and can reflow line breaks, so page text isn't always byte-identical to the source
 * sentences it came from — but no step in this module ever adds or drops a word, so word counts
 * stay exactly aligned no matter how a real-DOM-fit pass (see reading-page-measure.ts) later
 * reshuffles content between pages.
 */
export function computePageStartSentenceIndices(sentences: string[], pages: string[][]): number[] {
  if (pages.length === 0) return []
  if (sentences.length === 0) return pages.map(() => 0)

  const sentenceStartWords: number[] = []
  let sentenceWordTotal = 0
  for (const s of sentences) {
    sentenceStartWords.push(sentenceWordTotal)
    sentenceWordTotal += countWordsInSentence(s)
  }

  const result: number[] = []
  let pageStartWord = 0
  let searchFrom = 0
  for (const page of pages) {
    // Last sentence whose own start-word-offset is at or before this page's start.
    while (
      searchFrom + 1 < sentenceStartWords.length &&
      sentenceStartWords[searchFrom + 1]! <= pageStartWord
    ) {
      searchFrom++
    }
    result.push(searchFrom)
    for (const piece of page) pageStartWord += countWordsInSentence(piece)
  }
  return result
}

/**
 * Which page (0-based, clamped) contains `targetSentenceIndex`, given the per-page starts from
 * {@link computePageStartSentenceIndices} — the last page whose start is at or before the
 * target, since a page covers every sentence up to (not including) the next page's start.
 */
export function findPageIndexForSentenceIndex(
  pageStartSentenceIndices: number[],
  targetSentenceIndex: number,
): number {
  if (pageStartSentenceIndices.length === 0) return 0
  let lo = 0
  let hi = pageStartSentenceIndices.length - 1
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pageStartSentenceIndices[mid]! <= targetSentenceIndex) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Normalize {@link buildSentencePages} output (drop empty pages; if everything was empty, one page of trimmed text).
 *
 * We no longer collapse multiple pages into one batch on desktop: the old check (`fullText.length` vs
 * `min(maxChars, LLM_CHUNK_INPUT_CHAR_CAP)`) only matched the **character** budget, but pages can split on
 * **maxWords** (fallback limits or conservative caps). Merging then produced one article “page” taller
 * than the measured reader column, so users had to scroll the whole paste.
 */
export function mergeArticlePagesIfWholeTextFitsLimits(
  pages: string[][],
  _limits: PageSplitLimits,
  fullText: string,
  _isMobileViewport = false,
): string[][] {
  const nonEmpty = pages
    .map((p) => p.filter((s) => s.trim().length > 0))
    .filter((p) => p.length > 0)
  if (nonEmpty.length <= 1) {
    const t = collapseHorizontalWsOnly(fullText)
    return nonEmpty.length > 0 ? nonEmpty : t ? [[t]] : [[]]
  }
  return nonEmpty
}
