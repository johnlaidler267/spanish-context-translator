/** LLM JSON uses short keys (c,m,l,n); internal pipeline uses long names. */
export type RawChunk = {
  chunk: string
  meaning: string
  literal?: string
  note?: string
}

export type ReconciledChunk = {
  type: "chunk"
  chunk: string
  meaning: string
  literal?: string
  note?: string
}

export type ReconciledText = {
  type: "text"
  text: string
}

/** Standalone Roman numeral line (e.g. chapter) — stripped from chunk stream, shown as its own block. */
export type ReconciledChapter = {
  type: "chapter"
  label: string
}

export type ReconciledItem = ReconciledChunk | ReconciledText | ReconciledChapter

export type RomanChapterMarker = { insertAfterCanonIndex: number; label: string }

export type PageSplitLimits = {
  maxWords: number
  maxChars: number
}

export type PageSentenceRange = { pageIndex: number; start: number; end: number }

export type ReadSentence = {
  id: number
  /** Which LLM / article page this step came from (preload ranges use this). */
  sourcePageIndex: number
  chunks: Array<{
    id: number
    text: string
    meaning: string
    literal?: string
    grammar?: string
  }>
  /** Roman chapter line — own read step with no word chunks. */
  chapterHeading?: string
}
