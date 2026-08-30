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
  return { stripped: kept.join("\n"), markers }
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
