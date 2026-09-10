/**
 * Article-mode LLM page size: measure how many characters fit in the real reader
 * column (typography + width + viewport minus chrome), then apply a safety margin.
 *
 * Read-mode uses larger type; article pagination still follows article body metrics.
 */

import { READING_CONTENT_TOP_MOBILE_REM } from "@/lib/reading/reading-layout"
import type { PageSplitLimits } from "@/lib/translate"
import { looksLikeLineBreakHeavySource, pageSourceText, resolvePageSplitLimits } from "@/lib/translate"

/** Keep sentence batching conservative vs measured fill (wide glyphs, punctuation). */
const CHAR_BUDGET_SAFETY = 0.84
/**
 * Desktop: slack below binary-search fill so wide glyphs / punctuation don’t clip.
 * Footer + chrome are already subtracted in {@link articleBodyHeightPx}; keep this moderate so
 * pages aren’t capped at ~half a screen when {@link DESKTOP_ARTICLE_PAGE_LIMIT_SCALE} in App also applies.
 */
const DESKTOP_CHAR_BUDGET_SAFETY = 0.82

/** Desktop article outer padding top/bottom (matches ArticleContent md:pt-24 / md:pb-16). */
const DESKTOP_ARTICLE_TOP_PX = 96
const DESKTOP_ARTICLE_BOTTOM_PX = 64
/** Desktop article spacing before footer (matches ArticleContent `md:mb-8`). */
const DESKTOP_ARTICLE_TO_FOOTER_GAP_PX = 32
/**
 * Desktop pagination footer reserve (buttons are 44px tall + border/padding).
 * Keep this slightly conservative so text never collides with footer controls.
 */
const DESKTOP_PAGINATION_FOOTER_PX = 96

/** Mobile horizontal padding — ArticleContent px-6. */
const MOBILE_PAD_X_PX = 24 * 2
/** Desktop — md:px-8. */
const DESKTOP_PAD_X_PX = 32 * 2

const ARTICLE_MAX_WIDTH_PX = 700

/** Matches ArticleContent `max(5.5rem, env(safe-area-inset-bottom)+4.5rem)`. */
const MOBILE_BOTTOM_MIN_REM = 5.5
const MOBILE_BOTTOM_SAFE_PLUS_REM = 4.5

const REM = 16

/**
 * Spanish-heavy filler (~5–8 char tokens) so the probe isn’t biased by English-length words.
 * Repeated to build a long corpus for binary search.
 */
const SPANISH_FILLER_SENTENCE =
  "Las montañas se alzaban contra el cielo mientras la brisa movía las hojas. " +
  "María caminaba despacio, pensando en aquellas palabras que había escuchado. " +
  "El sendero serpenteaba entre robles y pinos; un pájaro cantaba a lo lejos. "

function buildSpanishCorpus(minChars: number): string {
  let s = ""
  while (s.length < minChars) s += SPANISH_FILLER_SENTENCE
  return s
}

function readSafeAreaInsets(): { top: number; bottom: number } {
  if (typeof document === "undefined") return { top: 0, bottom: 0 }
  const el = document.createElement("div")
  el.style.cssText =
    "position:absolute;left:-9999px;visibility:hidden;" +
    "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);"
  document.body.appendChild(el)
  const st = getComputedStyle(el)
  const top = parseFloat(st.paddingTop) || 0
  const bottom = parseFloat(st.paddingBottom) || 0
  document.body.removeChild(el)
  return { top, bottom }
}

/**
 * The article column's actual content width: its wrapper is `w-full` capped at
 * `ARTICLE_MAX_WIDTH_PX` (border-box, per Tailwind's global preflight — the max-width already
 * includes the wrapper's own horizontal padding), so the padding has to come off *after* the
 * 700px cap applies, not before. Subtracting it first (the original bug here) returned a flat
 * 700px content width on any viewport wide enough for the wrapper to hit its cap — ~64px wider
 * than the article box actually renders at on desktop, which under-measures how many lines a
 * given piece of text wraps to and so under-measures its real height too. That's a large enough
 * miss that a page the estimate (and, before this fix, the real-fit reflow too, since it reused
 * this same helper) judged as fitting could actually overflow the real, narrower box.
 */
function articleContentWidthPx(isMobile: boolean): number {
  const w = typeof window !== "undefined" ? window.innerWidth : ARTICLE_MAX_WIDTH_PX
  const pad = isMobile ? MOBILE_PAD_X_PX : DESKTOP_PAD_X_PX
  return Math.max(200, Math.min(ARTICLE_MAX_WIDTH_PX, w) - pad)
}

function articleBodyHeightPx(isMobile: boolean): number {
  if (typeof window === "undefined") return 400
  const vh = window.innerHeight
  const safe = readSafeAreaInsets()

  if (isMobile) {
    const top = safe.top + READING_CONTENT_TOP_MOBILE_REM * REM
    const bottom = Math.max(MOBILE_BOTTOM_MIN_REM * REM, safe.bottom + MOBILE_BOTTOM_SAFE_PLUS_REM * REM)
    return Math.max(120, vh - top - bottom)
  }

  return Math.max(
    160,
    vh -
      DESKTOP_ARTICLE_TOP_PX -
      DESKTOP_ARTICLE_BOTTOM_PX -
      DESKTOP_ARTICLE_TO_FOOTER_GAP_PX -
      DESKTOP_PAGINATION_FOOTER_PX,
  )
}

/**
 * Max characters that fit in the article body box with the same font metrics as `<article>` in ArticleContent.
 */
export function measureArticleBodyMaxChars(isMobile: boolean): number {
  if (typeof document === "undefined") return 0

  const width = articleContentWidthPx(isMobile)
  const height = articleBodyHeightPx(isMobile)
  if (width < 80 || height < 80) return 0

  const corpus = buildSpanishCorpus(16_000)

  const probe = document.createElement("div")
  probe.setAttribute("aria-hidden", "true")
  probe.className = isMobile
    ? "font-reading text-[1.6875rem] leading-[1.75] text-foreground"
    : "font-reading text-[1.725rem] leading-[1.85] text-foreground"
  Object.assign(probe.style, {
    position: "fixed",
    visibility: "hidden",
    left: "0",
    top: "0",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden",
    boxSizing: "border-box",
    whiteSpace: "normal",
    wordBreak: "normal",
    pointerEvents: "none",
    zIndex: "-1",
  })
  document.body.appendChild(probe)

  let lo = 0
  let hi = Math.min(corpus.length, 50_000)
  let best = 0

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    probe.textContent = corpus.slice(0, mid)
    if (probe.scrollHeight <= probe.clientHeight + 1) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  document.body.removeChild(probe)
  return best
}

/**
 * {@link PageSplitLimits} from DOM measurement, with char-primary batching (maxWords is a loose ceiling only).
 */
export function measureArticlePageSplitLimits(isMobile: boolean): PageSplitLimits {
  const raw = measureArticleBodyMaxChars(isMobile)
  const safety = isMobile ? CHAR_BUDGET_SAFETY : DESKTOP_CHAR_BUDGET_SAFETY
  const maxChars = Math.max(400, Math.floor(raw * safety))
  const maxWords = Math.max(2_000, Math.ceil(maxChars / 4))
  return { maxWords, maxChars }
}

/**
 * Same as {@link measureArticlePageSplitLimits} but waits for webfonts so serif metrics match the reader.
 */
export async function measureArticlePageSplitLimitsWhenReady(isMobile: boolean): Promise<PageSplitLimits> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  }
  const m = measureArticlePageSplitLimits(isMobile)
  if (m.maxChars <= 600) return resolvePageSplitLimits(isMobile)
  return m
}

/**
 * Slack below the measured real box applied only inside {@link reflowPagesForRealFit}'s fit
 * check. The book actually renders as interactive `TextChunk` spans (hover/underline padding
 * per word), not the plain text this probe measures, so a page that "just barely" fits the
 * plain-text probe could still clip a hair in the real chunked render. Per the product
 * requirement, a page that ends a little early beats one that overflows or scrolls.
 */
const REAL_FIT_HEIGHT_SAFETY = 0.93

function createRealFitProbe(isMobile: boolean, widthPx: number, heightPx: number): HTMLDivElement {
  const probe = document.createElement("div")
  probe.setAttribute("aria-hidden", "true")
  probe.className = isMobile
    ? "font-reading text-[1.6875rem] leading-[1.75] text-foreground"
    : "font-reading text-[1.725rem] leading-[1.85] text-foreground"
  Object.assign(probe.style, {
    position: "fixed",
    visibility: "hidden",
    left: "0",
    top: "0",
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    overflow: "hidden",
    boxSizing: "border-box",
    whiteSpace: "normal",
    wordBreak: "normal",
    pointerEvents: "none",
    zIndex: "-1",
  })
  document.body.appendChild(probe)
  return probe
}

/** Mirrors ArticleContent's verse handling (`whitespace-pre-line`, no collapsing) vs. prose. */
function setRealFitProbeText(probe: HTMLDivElement, text: string): void {
  probe.style.whiteSpace = looksLikeLineBreakHeavySource(text) ? "pre-line" : "normal"
  probe.textContent = text
}

type FitProbe = (pieces: string[]) => boolean

/**
 * Binary-searches the longest word-count prefix of `piece` that fits an otherwise-empty page,
 * per `fits`. Used only when a single page-split piece is, by itself, too tall for the real box
 * (an unusually long sentence/run) — splits it at a word boundary rather than dropping anything;
 * the remainder is carried forward onto the next page by the caller.
 *
 * Also returns the accepted prefix's real measured height (via `heightBox`, updated by `fits` on
 * every call — see `reflowPagesForRealFit`) so the caller can reuse it for desktop fill-padding
 * instead of re-measuring the same content in a second pass.
 */
function splitPieceForRealFit(
  piece: string,
  fits: FitProbe,
  heightBox: { value: number },
): [string, string, number] {
  const words = piece.split(/\s+/).filter(Boolean)
  if (words.length <= 1) {
    fits([piece])
    return [piece, "", heightBox.value]
  }
  let lo = 1
  let hi = words.length
  let best = 1
  let bestHeight = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fits([words.slice(0, mid).join(" ")])) {
      best = mid
      bestHeight = heightBox.value
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" "), bestHeight]
}

/**
 * Binary-searches the longest piece-count prefix of `current` (at least 1) that fits, per `fits`.
 * `current` is already known not to fit whole. Used instead of popping pieces off the end one at
 * a time so an overflowing page costs O(log n) real-DOM measurements instead of O(n) — the
 * difference between a snappy real-fit pass and one that hangs the tab on a real book (a long
 * page's worth of short sentences can be dozens of pieces; popping one at a time meant dozens of
 * forced layouts per overflowing page, and a systematic estimate/real mismatch across a whole
 * novel can mean *most* pages need this, not a rare few).
 *
 * Also returns the accepted prefix's real measured height, for the same reuse reason as
 * `splitPieceForRealFit` above.
 */
function findFittingPrefixLength(
  current: string[],
  fits: FitProbe,
  heightBox: { value: number },
): { length: number; height: number } {
  let lo = 1
  let hi = current.length
  let best = 0
  let bestHeight = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fits(current.slice(0, mid))) {
      best = mid
      bestHeight = heightBox.value
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return { length: best, height: bestHeight }
}

/**
 * Yield to the browser between batches of forced-layout measurements so a long reflow (a full
 * novel can be hundreds of pages) never blocks the main thread continuously -- without this the
 * tab can go fully unresponsive for the whole pass with no visible progress, indistinguishable
 * from a crash, even though the work itself eventually finishes.
 *
 * Deliberately `setTimeout`, not `requestAnimationFrame`: rAF only fires on an actual paint tick,
 * which browsers throttle or fully pause for a backgrounded/non-visible tab (switching tabs
 * mid-load, an inactive window) -- silently stalling this entire pass for as long as the tab stays
 * backgrounded, which read exactly like the original hang this was meant to fix. `setTimeout`
 * doesn't depend on painting at all, so it keeps yielding (and this pass keeps making progress)
 * whether or not the tab is currently visible.
 */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** How many real-DOM `fits()` measurements to run before yielding a frame back to the browser. */
const YIELD_EVERY_FITS_CALLS = 40

/**
 * Starting lookahead window size (in pieces) for `packOnePage`. Comfortably above a typical real
 * page's piece count for ordinary prose (a page usually holds somewhere around 4-12 sentences),
 * so the common case resolves in one or two `fits()` calls without needing to grow the window at
 * all.
 */
const INITIAL_LOOKAHEAD_PIECES = 16
/**
 * Hard cap on how far `packOnePage` will grow its lookahead window. Bounds the worst case (an
 * unusually short-sentence-heavy stretch, e.g. rapid-fire dialogue) to a small, constant number of
 * `fits()` calls per page regardless of book length — a page that could technically hold more than
 * this many short pieces just ends a little early instead, which is the accepted tradeoff.
 */
const MAX_LOOKAHEAD_PIECES = 128

/**
 * Authoritative real-DOM correction pass over `pages` (already produced by the fast word/char
 * estimate in `buildSentencePages`) that guarantees every page's content actually fits the real,
 * non-scrolling reading box — the fix for both the mobile content-loss bug and the desktop
 * overflow-past-the-footer bug.
 *
 * Root cause both bugs shared: `buildSentencePages` only ever consulted an *estimated* budget
 * (word/char limits calibrated against a generic filler paragraph — see
 * `measureArticlePageSplitLimits`), never the real rendered height of the book's own text. Real
 * Spanish prose varies enough in word/glyph width that a page the estimate predicted would fit
 * can actually run past the bottom of the box. On mobile the box scrolled (`overflow-y-auto`),
 * so the overflow was reachable in the DOM but never visible or reachable by the reader —
 * functionally lost content once the page arrow moved on to the next page's start. On desktop
 * there was no height cap at all, so the extra text just rendered past the footer.
 *
 * This pass never drops content: anything that doesn't fit is moved forward onto the next page,
 * splitting a single overlong piece by words only as a last resort (a piece alone too tall for
 * an empty page). A page may end a little short of full — that's the accepted tradeoff over ever
 * overflowing, scrolling, or losing text.
 *
 * Cheap for large books: in the common case (most pages already fit, thanks to the estimate's
 * own safety margin) this costs exactly one DOM measurement per page. Only pages that actually
 * overflow cost a few extra measurements, so pagination stays fast even for 1000+ page books —
 * this still runs once, up front, not per page-turn.
 *
 * Also returns `topFillPaddingPx` (see its own doc below) computed from the exact same
 * measurements this pass already takes, rather than a separate full second pass over every page —
 * that second pass used to double the total real-DOM measurement cost for no reason, since the
 * height this function measures to decide whether a page fits *is* the height the fill-padding
 * calculation needs too (line-wrapping only depends on width, which is identical between the two
 * probes, so a page's measured `scrollHeight` here is valid for both purposes).
 */
export async function reflowPagesForRealFit(
  pages: string[][],
  isMobile: boolean,
): Promise<{ pages: string[][]; topFillPaddingPx: number[] }> {
  if (typeof document === "undefined" || pages.length === 0) {
    return { pages, topFillPaddingPx: pages.map(() => 0) }
  }

  // Real Spanish serif metrics, not the fallback font's -- matches measureArticlePageSplitLimitsWhenReady's
  // own wait. Without this, a submit right after first paint (before the reading webfont has
  // finished downloading) measures against fallback-font line breaks that don't match what
  // actually renders a moment later, once the real font swaps in.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  }

  const width = articleContentWidthPx(isMobile)
  const height = articleBodyHeightPx(isMobile) * REAL_FIT_HEIGHT_SAFETY
  if (width < 80 || height < 80) return { pages, topFillPaddingPx: pages.map(() => 0) }

  // Flatten to one ordered piece stream and repack from scratch against the real box, ignoring
  // the estimate's own page boundaries entirely. Earlier this instead walked the *estimated*
  // pages one at a time, carrying forward whatever didn't fit onto the next estimated page's
  // content. That works fine when the estimate is only occasionally wrong, but the estimate here
  // is calibrated against generic filler text (see measureArticlePageSplitLimits), not this
  // book's real prose -- it's systematically a little generous or a little stingy for real text,
  // by a roughly constant amount per page. Carried forward across an entire book, that small
  // per-page bias compounds: the backlog grows page after page instead of averaging out, so
  // `current` (carry + next estimated page) got larger and larger the further into the book you
  // got, and every real-DOM measurement's cost scales with how much text it's measuring -- turning
  // total reflow cost roughly quadratic in book length. Fine for a short article, but a real
  // 500-600k-character novel could take minutes and never visibly progress (read by a reader as a
  // crash, not just "slow"). Packing from a flat, bounded lookahead window instead means a single
  // page never has to swallow another page's entire backlog, so cost per page -- and total cost --
  // stays roughly linear in book length regardless of how the estimate was biased.
  const flatPieces = pages.flat().filter((p) => p.length > 0)
  if (flatPieces.length === 0) return { pages, topFillPaddingPx: pages.map(() => 0) }

  const probe = createRealFitProbe(isMobile, width, height)
  let fitsCallCount = 0
  // Updated by `fits` on every call to the just-measured real height — lets callers below reuse
  // the measurement that decided a page fits for the fill-padding calculation too, instead of
  // re-measuring the same content again in a separate pass.
  const heightBox = { value: 0 }
  const fits: FitProbe = (pieces) => {
    fitsCallCount++
    setRealFitProbeText(probe, pageSourceText(pieces))
    heightBox.value = probe.scrollHeight
    return heightBox.value <= probe.clientHeight + 1
  }

  // One packed page's content: `usedWholePieces` counts how many entries from `flatPieces`
  // starting at `start` are fully consumed. When the very first piece alone didn't fit and had to
  // be split by words, `usedWholePieces` is 0 and `splitRemainder` carries the leftover words of
  // that same piece (still unconsumed) for the caller to put back before the next page.
  type PackedPage = {
    pieces: string[]
    height: number
    usedWholePieces: number
    splitRemainder: string | null
  }

  // Grows the lookahead window geometrically from `start` until it either overflows the real box
  // or would reach the end of the book, then (on overflow) binary-searches the true fitting
  // prefix within that window. Bounds each page's cost to O(log MAX_LOOKAHEAD_PIECES) measurements
  // over at most MAX_LOOKAHEAD_PIECES pieces of text, regardless of how far into the book this
  // page starts or how the original per-page estimate was biased.
  const packOnePage = (start: number, flatPieces: readonly string[]): PackedPage => {
    let windowSize = INITIAL_LOOKAHEAD_PIECES
    while (true) {
      const end = Math.min(flatPieces.length, start + windowSize)
      const windowPieces = flatPieces.slice(start, end)
      const wholeWindowFits = fits(windowPieces)
      const reachedEnd = end === flatPieces.length
      if (wholeWindowFits && (reachedEnd || windowSize >= MAX_LOOKAHEAD_PIECES)) {
        // Either the whole rest of the book fits, or we hit the lookahead cap while everything so
        // far still fits (an unusually short-sentence-heavy stretch) -- take it as-is. A page
        // ending at the cap instead of wherever the box would truly stop filling is the accepted
        // tradeoff for bounding cost.
        return {
          pieces: windowPieces,
          height: heightBox.value,
          usedWholePieces: windowPieces.length,
          splitRemainder: null,
        }
      }
      if (wholeWindowFits) {
        windowSize *= 2
        continue
      }
      // Window overflows — binary-search the longest prefix that actually fits.
      const found = findFittingPrefixLength(windowPieces, fits, heightBox)
      if (found.length > 0) {
        return {
          pieces: windowPieces.slice(0, found.length),
          height: found.height,
          usedWholePieces: found.length,
          splitRemainder: null,
        }
      }
      // A single piece alone still overflows an empty box — split it at a word boundary.
      const [prefix, remainder, prefixHeight] = splitPieceForRealFit(windowPieces[0]!, fits, heightBox)
      return {
        pieces: [prefix],
        height: prefixHeight,
        usedWholePieces: 0,
        splitRemainder: remainder || null,
      }
    }
  }

  try {
    const flatPieces = pages.flat().filter((p) => p.length > 0)
    if (flatPieces.length === 0) return { pages, topFillPaddingPx: pages.map(() => 0) }

    const result: string[][] = []
    const resultHeights: number[] = []
    let startIdx = 0

    // Safety valve only — a real bug elsewhere must never hang the tab forever. Bounded by piece
    // count (not page count): each page now costs at most ~(window-growth doublings + one binary
    // search) measurements, a small constant, so this is generous headroom rather than the tight
    // bound it has to actually do the work of enforcing.
    const maxFitsCalls = flatPieces.length * 20 + 4000
    let fitsCallCountAtLastYield = 0

    while (startIdx < flatPieces.length && fitsCallCount < maxFitsCalls) {
      const packed = packOnePage(startIdx, flatPieces)
      result.push(packed.pieces)
      resultHeights.push(packed.height)
      if (packed.usedWholePieces > 0) {
        startIdx += packed.usedWholePieces
      } else if (packed.splitRemainder) {
        // The piece at startIdx was replaced by its (shorter) word-split prefix — put the rest of
        // that same piece's words back so the next page's window picks up exactly where this one
        // left off, instead of skipping or duplicating any of it.
        flatPieces[startIdx] = packed.splitRemainder
      } else {
        startIdx += 1
      }

      if (fitsCallCount >= maxFitsCalls) break
      // Keep the tab responsive across a long reflow (a full novel can be hundreds of pages) —
      // without this the whole pass blocks the main thread continuously with no visible progress.
      if (fitsCallCount - fitsCallCountAtLastYield >= YIELD_EVERY_FITS_CALLS) {
        fitsCallCountAtLastYield = fitsCallCount
        await yieldToMainThread()
      }
    }

    // Safety-valve cap hit (should not happen) — keep whatever's left rather than losing it.
    if (startIdx < flatPieces.length) {
      result.push(flatPieces.slice(startIdx))
      resultHeights.push(Number.POSITIVE_INFINITY)
    }

    const topFillPaddingPx = isMobile
      ? result.map(() => 0)
      : computeTopFillPaddingFromHeights(resultHeights, articleBodyHeightPx(isMobile))

    return { pages: result, topFillPaddingPx }
  } finally {
    document.body.removeChild(probe)
  }
}

/** Desktop vertical-fill polish: never nudge a page down by more than this, however empty it
 *  is — a reader expects a page to start near the top, not float toward the middle. */
const FILL_POLISH_MAX_PADDING_PX = 96
/** Skip the nudge entirely for a page that's already close to full — not worth the padding. */
const FILL_POLISH_MIN_SLACK_PX = 48
/** Use well under half the empty space below an under-filled page as extra top padding, so
 *  this reads as "less top-heavy," not "centered." */
const FILL_POLISH_SLACK_FRACTION = 0.3

/**
 * Desktop-only vertical-fill polish: for each (already real-fit-corrected) page, how much extra
 * top padding (px) to add so a page whose content doesn't fill the box isn't always anchored
 * flush to the top with a large empty gap below it. Purely cosmetic (always 0 on mobile, and
 * always 0 for a page whose height came back non-finite — see `reflowPagesForRealFit`) — never
 * consulted for pagination correctness, which `reflowPagesForRealFit` already guarantees on its
 * own by construction. Takes each page's already-measured real height directly rather than
 * re-measuring, so a page's padding can never contradict what's already been verified to fit.
 */
function computeTopFillPaddingFromHeights(heights: number[], fullHeightPx: number): number[] {
  return heights.map((measuredHeight) => {
    if (!Number.isFinite(measuredHeight)) return 0
    const slack = Math.max(0, fullHeightPx - measuredHeight)
    if (slack < FILL_POLISH_MIN_SLACK_PX) return 0
    return Math.min(FILL_POLISH_MAX_PADDING_PX, Math.floor(slack * FILL_POLISH_SLACK_FRACTION))
  })
}
