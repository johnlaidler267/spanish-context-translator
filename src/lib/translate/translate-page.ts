import { postProcessChunks } from "@/lib/translate/chunk-merges"
import {
  chatFinishReasonFromOpenAiStylePayload,
  combineAssistantPayloadsForChunkParse,
  fetchChatCompletion,
  parseChatJsonErrorBody,
  throwChatHttpError,
} from "@/lib/translate/chat-completion"
import { buildChunkSortMessages } from "@/lib/translate/chunk-sort-prompt"
import { extractChunkJsonArrayFromText } from "@/lib/translate/chunk-json"
import {
  assertReconcileDidNotLeaveLongPlainTail,
  ChunkingCutOffError,
  coerceLlmChunkRow,
  coalesceGlueablePunctuationReconciledItems,
  hasLargeUntranslatedStretch,
  normalizeChunkingSource,
  normalizeRawChunk,
  reconcileChunks,
  tryUnwrapEmbeddedReconciledJson,
  UntranslatedStretchError,
} from "@/lib/translate/chunk-reconcile"
import { insertChapterMarkers, stripStandaloneRomanChapterLines } from "@/lib/translate/roman-chapters"
import { translateMaxCompletionTokens, translateModel, translationProvider } from "@/lib/translate/llm-settings"
import type { RawChunk, ReconciledItem, RomanChapterMarker } from "@/lib/translate/types"

/** How many times a cut-off page may be halved: up to four pieces. */
const MAX_CUT_OFF_SPLITS = 2

/**
 * LLM call(s) for one page of source text → reconciled items. Normally a single call. A reply
 * that leaves a large part of the page untranslated (see hasLargeUntranslatedStretch) is retried
 * once without the substring hints, which is what that reply answered instead of the page. A
 * reply cut off before the end of the page ({@link ChunkingCutOffError}) is retried as two halves
 * split at a sentence break, since retrying the same text at temperature 0 just stops in the same
 * place again.
 */
export async function translatePageText(input: string): Promise<ReconciledItem[]> {
  return translateSplittingIfCutOff(input, MAX_CUT_OFF_SPLITS)
}

async function translateSplittingIfCutOff(input: string, splitsLeft: number): Promise<ReconciledItem[]> {
  try {
    return await translateOnce(input)
  } catch (e) {
    const halves = e instanceof ChunkingCutOffError && splitsLeft > 0 ? splitNearMiddle(input) : null
    if (!halves) throw e
    console.warn("[translatePageText] reply was cut off; translating the page in two halves")
    const [first, gap, second] = halves
    const [a, b] = await Promise.all([
      translateSplittingIfCutOff(first, splitsLeft - 1),
      translateSplittingIfCutOff(second, splitsLeft - 1),
    ])
    return [...a, { type: "text", text: gap }, ...b]
  }
}

/**
 * `[before, whitespace, after]` cut at the sentence break nearest the middle of `text` (or the
 * nearest space when it's one long sentence), so the whitespace between the halves -- including a
 * paragraph break -- survives as its own text item. Null when there's nowhere sensible to cut.
 */
export function splitNearMiddle(text: string): [string, string, string] | null {
  const mid = text.length / 2
  const minPiece = text.length * 0.2
  const best = (re: RegExp): [number, number] | null => {
    let pick: [number, number] | null = null
    for (const m of text.matchAll(re)) {
      const ws = m[1]!
      const start = m.index! + m[0].length - ws.length
      const end = start + ws.length
      if (start < minPiece || text.length - end < minPiece) continue
      if (!/\p{L}/u.test(text.slice(0, start)) || !/\p{L}/u.test(text.slice(end))) continue
      if (!pick || Math.abs(start - mid) < Math.abs(pick[0] - mid)) pick = [start, end]
    }
    return pick
  }
  const cut = best(/[.!?…]["'»”’)\]]*(\s+)/gu) ?? best(/\S(\s+)/gu)
  if (!cut) return null
  return [text.slice(0, cut[0]), text.slice(cut[0], cut[1]), text.slice(cut[1])]
}

async function translateOnce(input: string): Promise<ReconciledItem[]> {
  const { stripped, markers: romanChapterMarkers } = stripStandaloneRomanChapterLines(input)
  const canonical = normalizeChunkingSource(stripped)
  if (!canonical) {
    throw new Error("No text to translate.")
  }

  try {
    return await requestPageChunks(canonical, romanChapterMarkers, { hints: true })
  } catch (e) {
    if (!(e instanceof UntranslatedStretchError)) throw e
    console.warn("[translatePageText] reply left part of the page untranslated; retrying without hints")
    return requestPageChunks(canonical, romanChapterMarkers, { hints: false })
  }
}

async function requestPageChunks(
  canonical: string,
  romanChapterMarkers: RomanChapterMarker[],
  { hints }: { hints: boolean },
): Promise<ReconciledItem[]> {
  const { system: systemContent, user: userContent } = buildChunkSortMessages(canonical, undefined, { hints })
  console.log("[translatePageText] LLM user prompt:", userContent)

  const base = {
    model: translateModel(),
    messages: [{ role: "system", content: systemContent }, { role: "user", content: userContent }],
    temperature: 0,
    max_tokens: translateMaxCompletionTokens(),
  }
  const res = await fetchChatCompletion(
    translationProvider() === "groq"
      ? {
          ...base,
          // reasoning_effort: TRANSLATE_REASONING_EFFORT,
          // reasoning_format: GROQ_REASONING_FORMAT_HIDDEN,
        }
      : { ...base, gemini_response_schema: "chunk_rows" },
  )

  if (!res.ok) {
    const detail = await parseChatJsonErrorBody(res)
    throwChatHttpError(res, detail)
  }

  const data = await res.json()
  const finish = chatFinishReasonFromOpenAiStylePayload(data)
  if (finish === "length") {
    throw new ChunkingCutOffError()
  }
  const raw = combineAssistantPayloadsForChunkParse(data)
  console.log("[translatePageText] final LLM reply:", raw)
  return chunkReplyToItems(raw, canonical, romanChapterMarkers)
}

/**
 * Model reply text → reconciled items for `canonical` (the exact TEXT sent in the prompt).
 * Throws when the reply has no usable chunk rows or leaves a long untranslated tail, or
 * {@link UntranslatedStretchError} when it leaves a large part of the page untranslated anywhere.
 */
export function chunkReplyToItems(
  raw: string,
  canonical: string,
  romanChapterMarkers: RomanChapterMarker[] = [],
): ReconciledItem[] {
  const parsed = extractChunkJsonArrayFromText(raw)
  const merged = postProcessChunks(parsed)
  const chunks: RawChunk[] = []
  for (const row of merged) {
    const c = coerceLlmChunkRow(row)
    if (c) chunks.push(normalizeRawChunk(c))
  }

  if (chunks.length === 1) {
    const unwrapped = tryUnwrapEmbeddedReconciledJson(chunks[0]!.chunk, canonical)
    if (unwrapped) {
      if (!unwrapped.some((item) => item.type === "chunk")) {
        throw new Error(
          "Model returned no usable chunk rows: each object needs source \"c\" and gloss \"m\". Without them the UI would show plain text only (one big type:text span).",
        )
      }
      if (hasLargeUntranslatedStretch(unwrapped)) throw new UntranslatedStretchError()
      return insertChapterMarkers(
        coalesceGlueablePunctuationReconciledItems(unwrapped),
        romanChapterMarkers,
      )
    }
  }

  const reconciled = reconcileChunks(chunks, canonical)
  if (!reconciled.some((item) => item.type === "chunk")) {
    throw new Error(
      "Model returned no usable chunk rows: each object needs source \"c\" and gloss \"m\". Without them the UI would show plain text only (one big type:text span).",
    )
  }
  assertReconcileDidNotLeaveLongPlainTail(reconciled, canonical.length)
  if (hasLargeUntranslatedStretch(reconciled)) throw new UntranslatedStretchError()
  return insertChapterMarkers(
    coalesceGlueablePunctuationReconciledItems(reconciled),
    romanChapterMarkers,
  )
}
