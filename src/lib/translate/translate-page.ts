import { postProcessChunks } from "@/lib/chunk-merges"
import {
  chatFinishReasonFromOpenAiStylePayload,
  combineAssistantPayloadsForChunkParse,
  fetchChatCompletion,
  parseChatJsonErrorBody,
  throwChatHttpError,
} from "@/lib/translate/chat-completion"
import { buildChunkSortUserPrompt } from "@/lib/translate/chunk-sort-prompt"
import { extractChunkJsonArrayFromText } from "@/lib/translate/chunk-json"
import {
  assertReconcileDidNotLeaveLongPlainTail,
  coerceLlmChunkRow,
  coalesceGlueablePunctuationReconciledItems,
  normalizeChunkingSource,
  normalizeRawChunk,
  reconcileChunks,
  tryUnwrapEmbeddedReconciledJson,
} from "@/lib/translate/chunk-reconcile"
import { insertChapterMarkers, stripStandaloneRomanChapterLines } from "@/lib/translate/roman-chapters"
import { TRANSLATE_MAX_COMPLETION_TOKENS, translateModel, translationProvider } from "@/lib/translate/llm-settings"
import type { RawChunk, ReconciledItem } from "@/lib/translate/types"

/** Single LLM call: chunk JSON → reconciled items for one page of source text. */
export async function translatePageText(input: string): Promise<ReconciledItem[]> {
  const { stripped, markers: romanChapterMarkers } = stripStandaloneRomanChapterLines(input)
  const canonical = normalizeChunkingSource(stripped)
  if (!canonical) {
    throw new Error("No text to translate.")
  }

  const systemContent = ""
  const userContent = buildChunkSortUserPrompt(canonical)
  console.log("[translatePageText] LLM user prompt:", userContent)

  const base = {
    model: translateModel(),
    messages: [{ role: "system", content: systemContent }, { role: "user", content: userContent }],
    temperature: 0,
    max_tokens: TRANSLATE_MAX_COMPLETION_TOKENS,
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
    throw new Error(
      "The model hit its output limit before finishing chunking this page. Tap Retry, or adjust LLM_CHUNK_INPUT_CHAR_CAP / TRANSLATE_MAX_COMPLETION_TOKENS if this is frequent.",
    )
  }
  const raw = combineAssistantPayloadsForChunkParse(data)
  console.log("[translatePageText] final LLM reply:", raw)
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
  return insertChapterMarkers(
    coalesceGlueablePunctuationReconciledItems(reconciled),
    romanChapterMarkers,
  )
}
