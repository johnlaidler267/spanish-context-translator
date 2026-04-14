/**
 * Article-mode LLM page size: measure how many characters fit in the real reader
 * column (typography + width + viewport minus chrome), then apply a safety margin.
 *
 * Read-mode uses larger type; article pagination still follows article body metrics.
 */

import { READING_CONTENT_TOP_MOBILE_REM } from "@/lib/reading-layout"
import type { PageSplitLimits } from "@/lib/translate"
import { resolvePageSplitLimits } from "@/lib/translate"

/** Keep sentence batching conservative vs measured fill (wide glyphs, punctuation). */
const CHAR_BUDGET_SAFETY = 0.84
/** Desktop needs extra margin at larger reading sizes so text clears footer controls without scrolling. */
const DESKTOP_CHAR_BUDGET_SAFETY = 0.70

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

function articleContentWidthPx(isMobile: boolean): number {
  const w = typeof window !== "undefined" ? window.innerWidth : ARTICLE_MAX_WIDTH_PX
  const pad = isMobile ? MOBILE_PAD_X_PX : DESKTOP_PAD_X_PX
  return Math.max(200, Math.min(ARTICLE_MAX_WIDTH_PX, w - pad))
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
    ? "font-reading text-[1.5625rem] leading-[1.75] text-foreground"
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
