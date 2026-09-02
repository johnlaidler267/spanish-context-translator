/**
 * Mobile reading chrome — keep band + body offset in sync.
 * Band = texture + gradient height; content top = text clears toolbar + gap.
 *
 * Single source of truth for the article body's top offset — ArticleContent's mobile padding-top
 * is driven by this (via `--reading-content-top`), and reading-page-measure.ts uses the same
 * constant to size its DOM height probe for article pagination. If this value doesn't match what
 * actually renders, the probe reserves the wrong amount of vertical space and under- or
 * over-fills each page (e.g. a page ends with visible empty space while more text spills to the
 * next page instead of fitting on the current one).
 */
export const READING_HEADER_BAND_REM = 10
export const READING_CONTENT_TOP_MOBILE_REM = 5.75

/** Slide texture bitmap up inside the band (px) — shows a lower slice of the asset, can extend past top (clipped). */
export const READING_HEADER_TEXTURE_SHIFT_UP_PX = 25
