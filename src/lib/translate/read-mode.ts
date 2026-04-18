import {
  coalesceGlueablePunctuationChunks,
  shouldGlueAfterPriorChunkReadGlue,
  splitIntoSentences,
} from "@/lib/translate/chunk-reconcile"
import type { PageSentenceRange, ReadSentence, ReconciledItem } from "@/lib/translate/types"

/**
 * Target joined Spanish length per Read-mode step on narrow viewports (chunk texts + gaps between
 * chunks). Steps are split only at chunk boundaries; a single chunk longer than this stays one step.
 * (LLM page size comes from DOM-measured article column; this only splits display steps.)
 */
export const READ_MODE_CHARS_PER_STEP_MOBILE = 165

/** Read-mode step size on desktop: max joined Spanish length per step (chunk boundaries only). */
export const READ_MODE_CHARS_PER_STEP_DESKTOP = 100

type ReadChunkRow = ReadSentence["chunks"][number]

type ReadPart = { kind: "gap" } | { kind: "chunk"; idx: number }

function buildReadParts(chunks: ReadChunkRow[]): ReadPart[] {
  const out: ReadPart[] = []
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!
    if (i > 0) {
      if (!shouldGlueAfterPriorChunkReadGlue(c.text)) out.push({ kind: "gap" })
    }
    out.push({ kind: "chunk", idx: i })
  }
  return out
}

function joinedReadLengthFromParts(chunks: ReadChunkRow[], parts: ReadPart[]): number {
  let n = 0
  for (const p of parts) {
    n += p.kind === "gap" ? 1 : chunks[p.idx]!.text.length
  }
  return n
}

/** Joined display length for read mode (chunk texts + one space per non-glued gap). */
function joinedReadDisplayLength(chunks: ReadChunkRow[]): number {
  if (chunks.length === 0) return 0
  const parts = buildReadParts(chunks)
  return joinedReadLengthFromParts(chunks, parts)
}

/**
 * Greedy contiguous groups capped at `maxChars` (chunk boundaries only). Used when a single chunk
 * exceeds `maxChars`, so no partition can respect the cap.
 */
function greedyChunkReadPartition(chunks: ReadChunkRow[], maxChars: number): ReadChunkRow[][] {
  const out: ReadChunkRow[][] = []
  let run: ReadChunkRow[] = []
  for (const c of chunks) {
    const nextRun = [...run, c]
    const nextLen = joinedReadDisplayLength(nextRun)
    if (run.length > 0 && nextLen > maxChars) {
      out.push(run)
      run = [c]
    } else {
      run = nextRun
    }
  }
  if (run.length > 0) out.push(run)
  return out
}

/** Prefix sums of {@link joinedReadDisplayLength} for chunk prefixes (length n+1, pref[0]=0). */
function readJoinedPrefixSums(chunks: ReadChunkRow[]): number[] {
  const pref: number[] = [0]
  for (let i = 0; i < chunks.length; i++) {
    pref.push(joinedReadDisplayLength(chunks.slice(0, i + 1)))
  }
  return pref
}

/**
 * dp[j][i] = minimum possible largest segment sum splitting the first i chunks into j groups
 * (contiguous, chunk boundaries only).
 */
function computeReadMinMaxDp(pref: number[], n: number): number[][] {
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(n + 1).fill(Infinity))
  for (let i = 1; i <= n; i++) {
    dp[1]![i] = pref[i]!
  }
  for (let j = 2; j <= n; j++) {
    for (let i = j; i <= n; i++) {
      let best = Infinity
      for (let t = j - 1; t < i; t++) {
        const cand = Math.max(dp[j - 1]![t]!, pref[i]! - pref[t]!)
        if (cand < best) best = cand
      }
      dp[j]![i] = best
    }
  }
  return dp
}

function recoverReadPartitionBounds(
  pref: number[],
  dp: number[][],
  j: number,
  i: number,
): number[] {
  if (j === 1) return [0, i]
  const target = dp[j]![i]!
  for (let t = j - 1; t < i; t++) {
    const cand = Math.max(dp[j - 1]![t]!, pref[i]! - pref[t]!)
    if (cand === target) {
      const inner = recoverReadPartitionBounds(pref, dp, j - 1, t)
      return [...inner, i]
    }
  }
  return [0, i]
}

/** Split one sentence's chunks into read steps: chunk boundaries only, sizes as equal as possible under `maxChars`. */
function partitionReadSentenceChunks(chunks: ReadChunkRow[], maxChars: number): ReadChunkRow[][] {
  const n = chunks.length
  if (n === 0) return []
  const pref = readJoinedPrefixSums(chunks)
  const total = pref[n]!
  if (total <= maxChars) return [[...chunks]]

  let maxAtomic = 0
  for (let i = 0; i < n; i++) {
    const w = pref[i + 1]! - pref[i]!
    if (w > maxAtomic) maxAtomic = w
  }
  if (maxAtomic > maxChars) {
    return greedyChunkReadPartition(chunks, maxChars)
  }

  const dp = computeReadMinMaxDp(pref, n)
  let bestK = n
  for (let k = 1; k <= n; k++) {
    if (dp[k]![n]! <= maxChars) {
      bestK = k
      break
    }
  }

  const bounds = recoverReadPartitionBounds(pref, dp, bestK, n)
  const groups: ReadChunkRow[][] = []
  for (let b = 0; b < bounds.length - 1; b++) {
    const lo = bounds[b]!
    const hi = bounds[b + 1]!
    groups.push(chunks.slice(lo, hi))
  }
  return groups
}

/**
 * Read mode: split each sentence into steps only at chunk boundaries. Uses the fewest steps such
 * that no step exceeds `maxCharsPerStep` joined length, and among those partitions minimizes the
 * largest step (so sizes stay as equal as possible). Single chunks longer than the cap use one step.
 */
function subdivideReadStepsAtChunkBoundaries(
  sentences: ReadSentence[],
  maxCharsPerStep: number,
): ReadSentence[] {
  const out: ReadSentence[] = []
  let nextId = 0
  let chunkId = 0

  for (const sent of sentences) {
    if (sent.chapterHeading) {
      out.push({
        id: nextId++,
        sourcePageIndex: sent.sourcePageIndex,
        chunks: [],
        chapterHeading: sent.chapterHeading,
      })
      continue
    }
    const groups = partitionReadSentenceChunks(sent.chunks, maxCharsPerStep)
    for (const group of groups) {
      if (group.length === 0) continue
      const merged = coalesceGlueablePunctuationChunks(group.map((c) => ({ ...c })))
      out.push({
        id: nextId++,
        sourcePageIndex: sent.sourcePageIndex,
        chunks: merged.map((c) => ({ ...c, id: chunkId++ })),
      })
    }
  }
  return out.map((s, idx) => ({ ...s, id: idx }))
}

export function subdivideReadStepsForDesktop(
  sentences: ReadSentence[],
  charsPerStep: number = READ_MODE_CHARS_PER_STEP_DESKTOP,
): ReadSentence[] {
  return subdivideReadStepsAtChunkBoundaries(sentences, charsPerStep)
}

/** Concatenate translated pages into one Read-mode sentence list (stable chunk ids). */
export function mergeReconciledPagesToSentences(
  pages: ReconciledItem[][],
): ReadSentence[] {
  const out: ReadSentence[] = []
  let chunkId = 0
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const reconciled = pages[pageIndex]!
    const sents = splitIntoSentences(reconciled)
    for (const s of sents) {
      out.push({
        id: out.length,
        sourcePageIndex: pageIndex,
        chunks: s.chunks.map((c) => ({ ...c, id: chunkId++ })),
        ...(s.chapterHeading != null ? { chapterHeading: s.chapterHeading } : {}),
      })
    }
  }
  return out.map((s, i) => ({ ...s, id: i }))
}

/** @see subdivideReadStepsAtChunkBoundaries — same balancing as desktop with a larger step budget. */
export function subdivideReadStepsForMobile(
  sentences: ReadSentence[],
  maxCharsPerStep: number,
): ReadSentence[] {
  return subdivideReadStepsAtChunkBoundaries(sentences, maxCharsPerStep)
}

/** Preload ranges in *display step* indices, after any mobile subdivision. */
export function pageStepRangesFromSentences(sentences: ReadSentence[]): PageSentenceRange[] {
  if (sentences.length === 0) return []
  const maxPage = Math.max(...sentences.map((s) => s.sourcePageIndex))
  const ranges: PageSentenceRange[] = []
  for (let p = 0; p <= maxPage; p++) {
    const idxs: number[] = []
    sentences.forEach((s, i) => {
      if (s.sourcePageIndex === p) idxs.push(i)
    })
    if (idxs.length === 0) continue
    const start = Math.min(...idxs)
    const end = Math.max(...idxs) + 1
    ranges.push({ pageIndex: p, start, end })
  }
  return ranges
}

export function sentenceCountsPerReconciledPage(
  reconciledPages: ReconciledItem[][],
): number[] {
  return reconciledPages.map((r) => splitIntoSentences(r).length)
}

export function cumulativePageSentenceRanges(counts: number[]): PageSentenceRange[] {
  let offset = 0
  return counts.map((n, pageIndex) => {
    const start = offset
    offset += n
    return { pageIndex, start, end: offset }
  })
}

/** How many pages starting from 0 are successfully loaded (stops at first gap). */
export function countConsecutiveLoadedPages(
  getPage: (i: number) => ReconciledItem[] | null,
  totalPages: number,
): number {
  let n = 0
  for (let i = 0; i < totalPages; i++) {
    if (getPage(i) != null) n++
    else break
  }
  return n
}
