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
 */
export const READING_HEADER_BAND_REM = 10
export const READING_CONTENT_TOP_MOBILE_REM = 2

/** Slide texture bitmap up inside the band (px) — shows a lower slice of the asset, can extend past top (clipped). */
export const READING_HEADER_TEXTURE_SHIFT_UP_PX = 25
