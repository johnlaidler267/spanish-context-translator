const HAS_LETTER_OR_NUMBER = /\p{L}|\p{N}/u

/**
 * Leading/trailing glue (spaces, ¿, commas, etc.) stays outside the underlined span;
 * letters/numbers and spaces *between* them stay inside so multi-word chunks still read as one unit.
 */
export function splitChunkTextForUnderline(text: string): {
  prefix: string
  underline: string
  suffix: string
} {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    const graphemes = Array.from(segmenter.segment(text), (s) => s.segment)
    let i = 0
    while (i < graphemes.length && !HAS_LETTER_OR_NUMBER.test(graphemes[i]!)) i++
    let j = graphemes.length
    while (j > i && !HAS_LETTER_OR_NUMBER.test(graphemes[j - 1]!)) j--
    return {
      prefix: graphemes.slice(0, i).join(""),
      underline: graphemes.slice(i, j).join(""),
      suffix: graphemes.slice(j).join(""),
    }
  }
  const chars = [...text]
  const isWordish = (c: string) => /^[\p{L}\p{M}\p{N}]$/u.test(c)
  let i = 0
  while (i < chars.length && !isWordish(chars[i]!)) i++
  let j = chars.length
  while (j > i && !isWordish(chars[j - 1]!)) j--
  return {
    prefix: chars.slice(0, i).join(""),
    underline: chars.slice(i, j).join(""),
    suffix: chars.slice(j).join(""),
  }
}

/** Core token for UI labels (details sheet title, etc.) — no leading/trailing punctuation. */
export function chunkTextForWordDisplay(text: string): string {
  const { underline } = splitChunkTextForUnderline(text)
  return underline.length > 0 ? underline : text.trim()
}
