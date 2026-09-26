import { collapseHorizontalWsOnly } from "@/lib/translate/text-ws"
import type { ReconciledChunk, ReconciledItem, RomanChapterMarker } from "@/lib/translate/types"

/** True when a whole line is only a Roman numeral (chapter heading). */
const STANDALONE_ROMAN_LINE_RE = /^(?=.)[IVXLCDM]+$/i

/**
 * Remove lines that consist only of a Roman numeral (e.g. `I` on its own line). Returns the body
 * text for chunking and marker positions as a character index into the same string passed to
 * {@link reconcileChunks} (after {@link normalizeChunkingSource}, i.e. newline-preserving).
 */
export function stripStandaloneRomanChapterLines(input: string): {
  stripped: string
  markers: RomanChapterMarker[]
} {
  const rawLines = input.split(/\r?\n/)
  const markers: RomanChapterMarker[] = []
  const kept: string[] = []

  for (const line of rawLines) {
    const t = line.trim()
    if (t.length > 0 && STANDALONE_ROMAN_LINE_RE.test(t)) {
      const bodySoFar = kept.join("\n")
      markers.push({
        insertAfterCanonIndex: bodySoFar.length,
        label: t.toUpperCase(),
      })
      continue
    }
    kept.push(line)
  }
  const stripped = kept.join("\n")
  return { stripped, markers: markers.map((m) => toCanonMarker(stripped, m)) }
}

/**
 * Map a marker's offset into `stripped` onto the normalized chunking source
 * (`collapseHorizontalWsOnly(stripped)`), which collapses whitespace runs and trims — otherwise
 * doubled spaces/tabs before a heading shift it earlier and split a word.
 */
function toCanonMarker(stripped: string, marker: RomanChapterMarker): RomanChapterMarker {
  const collapse = (s: string) => s.replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ")
  const leadingTrim = collapse(stripped).length - collapse(stripped).trimStart().length
  const canonLength = collapseHorizontalWsOnly(stripped).length
  const prefixLength = collapse(stripped.slice(0, marker.insertAfterCanonIndex)).length
  return {
    ...marker,
    insertAfterCanonIndex: Math.min(canonLength, Math.max(0, prefixLength - leadingTrim)),
  }
}

/**
 * Splice {@link ReconciledChapter} items into a reconciled stream at character offsets into the
 * newline-preserving chunking source (same string {@link reconcileChunks} uses).
 */
export function insertChapterMarkers(
  items: ReconciledItem[],
  markers: RomanChapterMarker[],
): ReconciledItem[] {
  if (markers.length === 0) return items
  const sorted = [...markers].sort((a, b) => a.insertAfterCanonIndex - b.insertAfterCanonIndex)
  let mi = 0
  let pos = 0
  const out: ReconciledItem[] = []

  const pushText = (t: string) => {
    if (t.length === 0) return
    out.push({ type: "text", text: t })
  }

  const pushChunkSlice = (item: ReconciledChunk, start: number, end: number) => {
    if (start >= end) return
    out.push({
      type: "chunk",
      chunk: item.chunk.slice(start, end),
      meaning: item.meaning,
      literal: item.literal,
      note: item.note,
    })
  }

  for (const item of items) {
    if (item.type === "chapter") {
      out.push(item)
      continue
    }
    const s = item.type === "text" ? item.text : item.chunk
    let lo = 0
    while (lo < s.length) {
      while (mi < sorted.length && sorted[mi]!.insertAfterCanonIndex === pos) {
        out.push({ type: "chapter", label: sorted[mi]!.label })
        mi++
      }
      const nextMark = sorted[mi]?.insertAfterCanonIndex ?? Infinity
      if (nextMark < pos) {
        mi++
        continue
      }
      const takeLen =
        nextMark === Infinity ? s.length - lo : Math.min(s.length - lo, nextMark - pos)
      if (takeLen <= 0) break
      if (item.type === "text") {
        pushText(s.slice(lo, lo + takeLen))
      } else {
        pushChunkSlice(item, lo, lo + takeLen)
      }
      lo += takeLen
      pos += takeLen
    }
  }
  while (mi < sorted.length && sorted[mi]!.insertAfterCanonIndex === pos) {
    out.push({ type: "chapter", label: sorted[mi]!.label })
    mi++
  }
  return out
}
