/**
 * A "cloth binding" color for a book with no cover image, picked from its title + author so the
 * same book always gets the same color. Only the landing page's Continue Reading row paints with
 * it (see .cr-covers in index.css): the shared plate palettes are all warm beiges, so a row of
 * coverless books read as four copies of one tile. Exposed as the --cover-cloth CSS variable.
 */
const CLOTH_COLORS = ["#2f5d87", "#a5583b", "#5d6b3e", "#7c5a86", "#8a6a2f", "#3f6f6a"] as const

export function coverClothColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return CLOTH_COLORS[Math.abs(hash) % CLOTH_COLORS.length]
}
