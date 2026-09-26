/**
 * Whether a paragraph's opening text can carry the article drop cap.
 *
 * CSS `::first-letter` pulls opening punctuation like ¿ ¡ « “ along with the letter, which reads
 * fine. But a dialogue dash (—, –, -) isn't "opening punctuation" to the browser, so a paragraph
 * starting "—¿Quiénes…" floats the dash alone at 3x size — a big orange bar with the real text
 * pushed beside it. Only show the drop cap when a letter follows any opening punctuation.
 */
export function canShowDropCap(text: string): boolean {
  return /^\s*[¿¡«“‘"'(\[]*\p{L}/u.test(text)
}
