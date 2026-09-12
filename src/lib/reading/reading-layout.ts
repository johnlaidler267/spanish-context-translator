/**
 * Mobile reading chrome — keep band + body offset in sync.
 * Band = texture + gradient height (the header's own decorative backdrop, not article spacing).
 *
 * Single source of truth for the article body's top offset — ArticleContent's mobile padding-top
 * is driven by this (via `--reading-content-top`), and reading-page-measure.ts uses the same
 * constant to size its DOM height probe for article pagination. If this value doesn't match what
 * actually renders, the probe reserves the wrong amount of vertical space and under- or
 * over-fills each page (e.g. a page ends with visible empty space while more text spills to the
 * next page instead of fitting on the current one).
 *
 * Deliberately small: the reading toolbar (see reading-header.tsx) is a `fixed`, auto-hiding
 * overlay with a translucent/blurred backdrop, not a bar that pushes content down — it floats
 * over the article rather than occupying its own row. Article content used to reserve a full
 * toolbar's height here (~5.75rem) as if the header were always visible and in-flow, which left
 * mobile pages starting nearly a quarter of the way down the screen even though the toolbar
 * itself fades out after a short idle period. Only a small top gap is reserved now (clears the
 * safe-area notch plus a little breathing room) so a page makes full use of the viewport; the
 * toolbar simply overlays the first line or two on the rare moments it's shown.
 *
 * Not quite the bare notch clearance, though: a word tooltip on touch always places itself
 * above the word (below would sit under the finger — see text-chunk.tsx), so the gap above the
 * first line is also the only room a first-line word's tooltip has. At the old 2rem there was
 * none, and the card clamped to the viewport edge and landed on the word itself, where the
 * thumb holding that word hid it. This buys a typical card enough room to clear the first line
 * while still leaving the page most of the viewport.
 *
 * On mobile this is the WHOLE band above the text, running head included: the book title is
 * positioned inside it rather than sitting in flow (see article-content.tsx), so that a band
 * which would otherwise read as unexplained empty space reads as a margin beneath a running
 * head. That also makes this constant exactly the space above the text, which is what
 * reading-page-measure.ts already assumed it was — before, the title row and its margin ate a
 * further ~36px that the probe never modelled and REAL_FIT_HEIGHT_SAFETY quietly absorbed.
 */
export const READING_HEADER_BAND_REM = 10
export const READING_CONTENT_TOP_MOBILE_REM = 7

/** Slide texture bitmap up inside the band (px) — shows a lower slice of the asset, can extend past top (clipped). */
export const READING_HEADER_TEXTURE_SHIFT_UP_PX = 25
