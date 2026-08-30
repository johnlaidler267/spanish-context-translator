import { jsonrepair } from "jsonrepair"
import { collapseHorizontalWsOnly, squashWsForReconcileCompare } from "@/lib/translate/text-ws"
import type { RawChunk, ReconciledChunk, ReconciledItem } from "@/lib/translate/types"

/**
 * If reconcile ever yields two chunks in a row with no `type: "text"` between them,
 * insert a space when both sides look like word characters (avoids "palabrapalabra" glitches).
 */
export function gapBetweenReconciledChunks(
  prev: ReconciledChunk,
  next: ReconciledChunk,
): string {
  const a = prev.chunk
  const b = next.chunk
  if (/\s$/.test(a) || /^\s/.test(b)) return ""
  const word = /[\w\u00C0-\u024F]/
  if (word.test(a.slice(-1)) && word.test(b.charAt(0))) return " "
  return ""
}

/** Map LLM row (c/m/l/n or legacy chunk/meaning/literal/note) → RawChunk. */
function coerceLlmChunkRow(raw: unknown): RawChunk | null {
  if (raw == null || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const chunk = pickLlmStr(o, "c", "chunk")
  const meaning = pickLlmStr(o, "m", "meaning")
  if (chunk === undefined || meaning === undefined) return null
  const literal = pickLlmOptStr(o, "l", "literal")
  const noteRaw = pickLlmNote(o, "n", "note")
  const note = noteRaw === null ? undefined : noteRaw
  return { chunk, meaning, literal, note }
}

function pickLlmStr(o: Record<string, unknown>, short: string, long: string): string | undefined {
  const v = o[short] !== undefined ? o[short] : o[long]
  if (v === null || v === undefined) return undefined
  return typeof v === "string" ? v : String(v)
}

function pickLlmOptStr(o: Record<string, unknown>, short: string, long: string): string | undefined {
  const v = o[short] !== undefined ? o[short] : o[long]
  if (v === null || v === undefined) return undefined
  return typeof v === "string" ? v : String(v)
}

function pickLlmNote(
  o: Record<string, unknown>,
  short: string,
  long: string,
): string | undefined | null {
  const v = o[short] !== undefined ? o[short] : o[long]
  if (v === null) return null
  if (v === undefined) return undefined
  return typeof v === "string" ? v : String(v)
}

function normalizeRawChunk(raw: RawChunk): RawChunk {
  const chunk =
    typeof raw.chunk === "string" ? raw.chunk : raw.chunk != null ? String(raw.chunk) : ""
  const meaning =
    typeof raw.meaning === "string" ? raw.meaning : raw.meaning != null ? String(raw.meaning) : ""
  return { ...raw, chunk, meaning }
}

/**
 * Text sent to the chunking model and used for {@link reconcileChunks}: collapse horizontal
 * whitespace only so verse / lyrics line breaks stay in the source and in gap `type:"text"` spans.
 */
export function normalizeChunkingSource(s: string): string {
  return collapseHorizontalWsOnly(s)
}

/**
 * Model occasionally returns one row whose Spanish field is a stringified reconciled-style
 * `[{type:"chunk"|"text",…},…]` array. `reconcileChunks` then treats it as literal text,
 * fails `indexOf` against the real source, and Read mode shows the raw JSON.
 */
function tryUnwrapEmbeddedReconciledJson(
  spanishField: string,
  sourcePageText: string,
): ReconciledItem[] | null {
  const t = spanishField.trim()
  if (t.length < 80 || !t.startsWith("[")) return null
  if (!/"type"\s*:\s*"(chunk|text)"/.test(t)) return null

  try {
    const parsed = JSON.parse(jsonrepair(t)) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    const items: ReconciledItem[] = []
    for (const el of parsed) {
      if (el == null || typeof el !== "object") continue
      const o = el as Record<string, unknown>
      if (o.type === "text") {
        const tx = o.text
        if (typeof tx === "string") items.push({ type: "text", text: tx })
        continue
      }
      if (o.type === "chunk") {
        const chunk = typeof o.chunk === "string" ? o.chunk : String(o.chunk ?? "")
        const meaning = typeof o.meaning === "string" ? o.meaning : String(o.meaning ?? "")
        if (!chunk.trim() || !meaning.trim()) continue
        items.push({
          type: "chunk",
          chunk,
          meaning,
          literal: typeof o.literal === "string" ? o.literal : undefined,
          note: typeof o.note === "string" ? o.note : undefined,
        })
        continue
      }
      const c = coerceLlmChunkRow(el)
      if (c) {
        items.push({
          type: "chunk",
          chunk: c.chunk,
          meaning: c.meaning,
          literal: c.literal,
          note: c.note,
        })
      }
    }

    if (!items.some((i) => i.type === "chunk")) return null

    const rebuilt = items
      .map((i) =>
        i.type === "text" ? i.text : i.type === "chapter" ? i.label : i.chunk,
      )
      .join("")
    if (squashWsForReconcileCompare(rebuilt) !== squashWsForReconcileCompare(sourcePageText)) {
      return null
    }
    return items
  } catch {
    return null
  }
}

/**
 * Last-line guard when a completion is still truncated (verbose model, cap mis-tuned, or missing `finish_reason`).
 * Distinct from viewport pagination: {@link LLM_CHUNK_INPUT_CHAR_CAP} should keep batches small enough that this rarely fires.
 */
function assertReconcileDidNotLeaveLongPlainTail(items: ReconciledItem[], sourceLen: number): void {
  if (items.length === 0 || sourceLen < 120) return
  const last = items[items.length - 1]!
  if (last.type !== "text") return
  const tail = last.text
  if (!/[\p{L}]/u.test(tail)) return
  const minSuspicious = Math.max(160, Math.floor(sourceLen * 0.09))
  if (tail.length >= minSuspicious) {
    throw new Error(
      "Chunking was cut off mid-page (model output limit). Tap Retry on this article page; if it keeps happening, lower LLM_CHUNK_INPUT_CHAR_CAP or raise TRANSLATE_MAX_COMPLETION_TOKENS.",
    )
  }
}

/**
 * If the model matched the inner word of a markdown-style **…** span, extend the match to include
 * those pairs. Does not absorb a lone * (e.g. multiplication or footnote markers between words).
 */
function snapBoldAsteriskWrappers(s: string, idx: number, len: number): { idx: number; len: number } {
  let i = idx
  let j = idx + len
  while (i >= 2 && s.slice(i - 2, i) === "**") i -= 2
  while (j + 2 <= s.length && s.slice(j, j + 2) === "**") j += 2
  return { idx: i, len: j - i }
}

function findChunkSpanInSource(
  original: string,
  span: string,
  searchStart: number,
): { idx: number; len: number } | null {
  const start = Math.max(0, searchStart - Math.max(0, span.length - 1))
  const tryNeedle = (needle: string): { idx: number; len: number } | null => {
    if (!needle) return null
    let idx = original.indexOf(needle, searchStart)
    if (idx === -1) idx = original.indexOf(needle, start)
    if (idx === -1) return null
    return snapBoldAsteriskWrappers(original, idx, needle.length)
  }

  const exact = tryNeedle(span)
  if (exact) return exact
  const stripped = span.replace(/^\*+/, "").replace(/\*+$/, "")
  if (!stripped || stripped === span) return null
  return tryNeedle(stripped)
}

export function reconcileChunks(
  chunks: RawChunk[],
  originalText: string
): ReconciledItem[] {
  const result: ReconciledItem[] = []
  let pos = 0

  for (const raw of chunks) {
    if (raw == null || typeof raw !== "object") continue
    const chunk = normalizeRawChunk(raw as RawChunk)
    if (!chunk.chunk) continue

    // Allow one-boundary overlap so "de"+"el" in "del" (and similar splits) still align: after
    // matching "de", `pos` sits on `l`; the next row "el" must match `el` inside "del", not a
    // later substring like the one starting "ella".
    const span = chunk.chunk
    const searchStart = Math.max(0, pos - span.length + 1)
    const found = findChunkSpanInSource(originalText, span, searchStart)
    if (!found) {
      result.push({ type: "chunk", ...chunk })
      continue
    }
    const { idx, len } = found
    const sourceSlice = originalText.slice(idx, idx + len)
    if (idx > pos) {
      result.push({ type: "text", text: originalText.slice(pos, idx) })
    }
    result.push({ type: "chunk", ...chunk, chunk: sourceSlice })
    pos = idx + len
  }

  if (pos < originalText.length) {
    result.push({ type: "text", text: originalText.slice(pos) })
  }

  return result
}

/** Same rules as `shouldGlueAfterPriorChunk` in text-chunk.tsx — keep in sync for length/slicing. */
function isPunctuationOnlyForReadGlue(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /^[^\w\u00C0-\u024F]+$/.test(t)
}

const OPENING_PUNCT_RE_FOR_READ_GLUE = /^[¿¡(«"“‘\u201C\u2018]/

export function shouldGlueAfterPriorChunkReadGlue(nextChunkText: string): boolean {
  if (!isPunctuationOnlyForReadGlue(nextChunkText)) return false
  const t = nextChunkText.trim()
  if (OPENING_PUNCT_RE_FOR_READ_GLUE.test(t)) return false
  return true
}

/** Reconcile gaps that are only spaces + closing punct (e.g. ` , ` between “fue” and “a”). */
function isClosingPunctuationOnlyGap(s: string): boolean {
  return /^\s*[,.;:!?…]+(?:\s*[,.;:!?…]+)*\s*$/u.test(s)
}

/**
 * Attach closing punctuation/symbol-only chunks to the previous chunk so read mode does not
 * show them as separate tappable tokens (also fixes desktop read steps that slice between word and `.`).
 */
export function coalesceGlueablePunctuationChunks<
  T extends { text: string; meaning?: string; literal?: string; grammar?: string },
>(chunks: T[]): T[] {
  if (chunks.length <= 1) return chunks
  const out: T[] = [chunks[0]!]
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i]!
    if (shouldGlueAfterPriorChunkReadGlue(c.text)) {
      const prev = out[out.length - 1]!
      prev.text += c.text
    } else {
      out.push(c)
    }
  }
  return out
}

/**
 * Merge closing punctuation-only chunk rows into the previous Spanish chunk (same rules as
 * {@link coalesceGlueablePunctuationChunks}). Article mode renders `ReconciledItem[]` directly;
 * without this, LLM rows like `","` stay a separate inline node on phones (read mode was already
 * fixed via `splitIntoSentences`).
 */
export function coalesceGlueablePunctuationReconciledItems(
  items: ReconciledItem[],
): ReconciledItem[] {
  const out: ReconciledItem[] = []
  let pendingText = ""

  const flushPendingText = () => {
    if (pendingText.length === 0) return
    out.push({ type: "text", text: pendingText })
    pendingText = ""
  }

  for (const item of items) {
    if (item.type === "chapter") {
      flushPendingText()
      out.push(item)
      continue
    }
    if (item.type === "text") {
      pendingText += item.text ?? ""
      continue
    }
    const span =
      typeof item.chunk === "string" ? item.chunk : String(item.chunk ?? "")
    const last = out[out.length - 1]

    if (last?.type === "chunk" && shouldGlueAfterPriorChunkReadGlue(span)) {
      const prefix = pendingText.replace(/\s+$/, "")
      last.chunk += prefix + span
      pendingText = ""
      continue
    }

    if (
      last?.type === "chunk" &&
      isClosingPunctuationOnlyGap(pendingText) &&
      !shouldGlueAfterPriorChunkReadGlue(span)
    ) {
      last.chunk += pendingText
      pendingText = ""
    }

    flushPendingText()
    out.push({
      type: "chunk",
      chunk: span,
      meaning: item.meaning,
      literal: item.literal,
      note: item.note,
    })
  }
  flushPendingText()
  return out
}

export function splitIntoSentences(items: ReconciledItem[]) {
  const sentences: {
    id: number
    chunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }>
    chapterHeading?: string
  }[] = []
  let currentChunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }> = []
  let chunkId = 0
  /** Spaces / punctuation between chunks live in `type: "text"` items — must merge into chunk text or read mode glues words together */
  let pendingBetween = ""

  for (const item of items) {
    if (item.type === "chapter") {
      if (pendingBetween && currentChunks.length > 0) {
        currentChunks[currentChunks.length - 1]!.text += pendingBetween
        pendingBetween = ""
      } else if (pendingBetween && currentChunks.length === 0) {
        pendingBetween = ""
      }
      if (currentChunks.length > 0) {
        sentences.push({ id: sentences.length, chunks: currentChunks })
        currentChunks = []
      }
      sentences.push({ id: sentences.length, chunks: [], chapterHeading: item.label })
      continue
    }
    if (item.type === "text") {
      pendingBetween += item.text ?? ""
      continue
    }
    const span = typeof item.chunk === "string" ? item.chunk : String(item.chunk ?? "")
    if (
      currentChunks.length > 0 &&
      isClosingPunctuationOnlyGap(pendingBetween) &&
      !shouldGlueAfterPriorChunkReadGlue(span)
    ) {
      currentChunks[currentChunks.length - 1]!.text += pendingBetween
      pendingBetween = ""
    }
    const prefix = shouldGlueAfterPriorChunkReadGlue(span)
      ? pendingBetween.replace(/\s+$/, "")
      : pendingBetween

    // LLM often emits closing punctuation as its own row; attach to the preceding word
    // so read mode treats it as one token (same rules as glue for type:"text" gaps).
    if (currentChunks.length > 0 && shouldGlueAfterPriorChunkReadGlue(span)) {
      const prev = currentChunks[currentChunks.length - 1]!
      prev.text += prefix + span
      pendingBetween = ""
      const endsSentence = /[.!?]$/.test(span.trim())
      if (endsSentence && currentChunks.length > 0) {
        sentences.push({ id: sentences.length, chunks: currentChunks })
        currentChunks = []
      }
      continue
    }

    const chunkData = {
      id: chunkId++,
      text: prefix + span,
      meaning: typeof item.meaning === "string" ? item.meaning : String(item.meaning ?? ""),
      literal: item.literal,
      grammar: item.note,
    }
    pendingBetween = ""
    currentChunks.push(chunkData)
    const endsSentence = /[.!?]$/.test(span.trim())
    if (endsSentence && currentChunks.length > 0) {
      sentences.push({ id: sentences.length, chunks: currentChunks })
      currentChunks = []
    }
  }
  if (pendingBetween && currentChunks.length > 0) {
    const last = currentChunks[currentChunks.length - 1]!
    last.text += pendingBetween
  }
  if (currentChunks.length > 0) {
    sentences.push({ id: sentences.length, chunks: currentChunks })
  }
  let nextChunkId = 0
  return sentences.map((s) => ({
    ...s,
    chunks: coalesceGlueablePunctuationChunks(s.chunks.map((c) => ({ ...c }))).map((c) => ({
      ...c,
      id: nextChunkId++,
    })),
  }))
}

export {
  coerceLlmChunkRow,
  normalizeRawChunk,
  tryUnwrapEmbeddedReconciledJson,
  assertReconcileDidNotLeaveLongPlainTail,
}
