/**
 * Validation for the article-mode "type a page number to jump" pager input.
 * Kept as pure functions (no React) so the parsing/clamping rules are unit-testable
 * without rendering the pager itself — see article-content.tsx for the input's UI.
 */

/**
 * Parse a page-number input, ignoring anything non-numeric.
 * Returns null for empty/non-numeric/zero/negative input — those never navigate; the pager
 * just reverts to showing the current page instead of jumping.
 */
export function parsePageJumpInput(raw: string): number | null {
  const digits = raw.trim().replace(/[^0-9]/g, "")
  if (!digits) return null
  const n = Number.parseInt(digits, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Clamp a 1-based page number into the valid `[1, pageCount]` range. */
export function clampPageNumber(page: number, pageCount: number): number {
  if (pageCount <= 0) return 1
  return Math.min(Math.max(page, 1), pageCount)
}

/**
 * Full resolve for a submitted jump-input value: parse, then clamp to the book's page count.
 * Null means "don't navigate" (empty/non-numeric input) — distinct from a clamped in-range
 * value that happens to equal the current page, which the caller can no-op on separately.
 */
export function resolvePageJumpTarget(raw: string, pageCount: number): number | null {
  const parsed = parsePageJumpInput(raw)
  if (parsed == null) return null
  return clampPageNumber(parsed, pageCount)
}
