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

/**
 * Binary-searches the longest word-count prefix of `piece` that fits an otherwise-empty page,
 * per `fits`. Used only when a single page-split piece is, by itself, too tall for the real box
 * (an unusually long sentence/run) — splits it at a word boundary rather than dropping anything;
 * the remainder is carried forward onto the next page by the caller.
 */
function splitPieceForRealFit(piece: string, fits: (pieces: string[]) => boolean): [string, string] {
  const words = piece.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return [piece, ""]
  let lo = 1
  let hi = words.length
  let best = 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fits([words.slice(0, mid).join(" ")])) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")]
}

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
 */
export async function reflowPagesForRealFit(pages: string[][], isMobile: boolean): Promise<string[][]> {
  if (typeof document === "undefined" || pages.length === 0) return pages

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
  if (width < 80 || height < 80) return pages

  const probe = createRealFitProbe(isMobile, width, height)
  const fits = (pieces: string[]): boolean => {
    setRealFitProbeText(probe, pageSourceText(pieces))
    return probe.scrollHeight <= probe.clientHeight + 1
  }

  try {
    const result: string[][] = []
    let carry: string[] = []
    let qi = 0

    // Safety valve only — a real bug elsewhere must never hang the tab. Generous relative to
    // total content, since a cascading overflow can, in the worst case, touch every piece once.
    const totalPieces = pages.reduce((n, p) => n + p.length, 0)
    const maxIterations = totalPieces * 4 + pages.length + 1000
    let iterations = 0

    while ((qi < pages.length || carry.length > 0) && iterations < maxIterations) {
      iterations++
      const current = qi < pages.length ? carry.concat(pages[qi]!) : carry
      carry = []
      qi++
      if (current.length === 0) continue

      if (fits(current)) {
        result.push(current)
        continue
      }

      // Shrink from the end until what's left fits, carrying the removed tail forward.
      while (current.length > 1 && !fits(current)) {
        carry.unshift(current.pop()!)
      }

      if (fits(current)) {
        result.push(current)
        continue
      }

      // A single piece alone still overflows an empty box — split it at a word boundary.
      const [prefix, remainder] = splitPieceForRealFit(current[0]!, fits)
      result.push([prefix])
      if (remainder) carry.unshift(remainder)
    }

    // Iteration cap hit (should not happen) — keep whatever's left rather than losing it.
    if (carry.length > 0) result.push(carry)
    for (; qi < pages.length; qi++) result.push(pages[qi]!)

    return result.filter((p) => p.length > 0)
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
 * flush to the top with a large empty gap below it. Purely cosmetic and always 0 on mobile
 * (the screen's tight enough already that top-anchoring reads fine, and the padding would eat
 * into an already-small content area) — never consulted for pagination correctness, which
 * `reflowPagesForRealFit` already guarantees on its own. Reuses that same real-DOM measurement,
 * so a page's padding can never contradict what's already been verified to fit.
 */
export function measurePageTopFillPaddingPx(pages: string[][], isMobile: boolean): number[] {
  if (isMobile || typeof document === "undefined" || pages.length === 0) return pages.map(() => 0)
  const width = articleContentWidthPx(isMobile)
  const height = articleBodyHeightPx(isMobile)
  if (width < 80 || height < 80) return pages.map(() => 0)

  const probe = createRealFitProbe(isMobile, width, height)
  try {
    return pages.map((page) => {
      setRealFitProbeText(probe, pageSourceText(page))
      const slack = Math.max(0, height - probe.scrollHeight)
      if (slack < FILL_POLISH_MIN_SLACK_PX) return 0
      return Math.min(FILL_POLISH_MAX_PADDING_PX, Math.floor(slack * FILL_POLISH_SLACK_FRACTION))
    })
  } finally {
    document.body.removeChild(probe)
  }
}
