/**
 * useChunkDetails
 *
 * Provides `fetchDetails(chunk, sentence)` and the resulting state.
 *
 * All lookups go through the LLM (Groq). No static reverse-conjugation table.
 *
 * The model returns JSON: either a conjugated-verb analysis (infinitive, tense,
 * person, context note) or a plain explanation for non-verb tokens.
 */

import { useCallback, useRef, useState } from "react"
import { fetchChunkDetailsViaEdge } from "@/lib/groq-edge"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DetailState =
  | {
      type: "llm_verb"
      infinitive: string
      tense: string
      person: string
      contextNote: string
    }
  | { type: "llm"; text: string }

export interface ChunkDetailsState {
  /** The raw Spanish text of the currently selected chunk. */
  activeChunk: string | null
  detail:      DetailState | null
  loading:     boolean
  error:       string | null
  /** Open the details box for a chunk. Triggers LLM lookup. */
  fetchDetails: (chunk: string, sentence: string) => void
  /** Dismiss / close the details box. */
  close: () => void
}

// ─── LLM JSON shape ───────────────────────────────────────────────────────────

interface LlmVerbPayload {
  kind:       "verb"
  infinitive: string
  tense:      string
  person:     string
  contextNote: string
}

interface LlmOtherPayload {
  kind:         "other"
  explanation: string
}

type LlmPayload = LlmVerbPayload | LlmOtherPayload

/**
 * Model sometimes returns pseudo-JSON with unescaped " inside explanation; JSON.parse fails.
 * If the payload still ends with `"}`, we can take the slice between "explanation":" and that closing quote.
 */
function extractOtherExplanationLenient(raw: string): string | null {
  const needle = '"explanation":"'
  const idx = raw.indexOf(needle)
  if (idx === -1) return null
  const valueStart = idx + needle.length
  const close = raw.lastIndexOf('"}')
  if (close === -1 || close < valueStart) return null
  const inner = raw
    .slice(valueStart, close)
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim()
  return inner || null
}

/** If the model JSON ended up as a single string (invalid parse on server), pull out the explanation. */
function salvageLlmJsonBlob(d: DetailState): DetailState {
  if (d.type !== "llm") return d
  const t = d.text.trim()
  if (t.startsWith("{") && t.includes('"explanation"')) {
    const salvaged = extractOtherExplanationLenient(t)
    if (salvaged) return { type: "llm", text: salvaged }
  }
  return d
}

function parseChunkDetailJson(raw: string): DetailState {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    const salvaged = extractOtherExplanationLenient(cleaned)
    return salvageLlmJsonBlob({ type: "llm", text: salvaged ?? raw })
  }

  if (!obj || typeof obj !== "object") return { type: "llm", text: raw }
  const o = obj as Record<string, unknown>

  if (o.kind === "verb") {
    const infinitive = typeof o.infinitive === "string" ? o.infinitive.trim() : ""
    if (!infinitive) return { type: "llm", text: raw }

    return {
      type: "llm_verb",
      infinitive,
      tense: typeof o.tense === "string" && o.tense.trim() ? o.tense.trim() : "—",
      person: typeof o.person === "string" && o.person.trim() ? o.person.trim() : "—",
      contextNote:
        typeof o.contextNote === "string" && o.contextNote.trim()
          ? o.contextNote.trim()
          : typeof o.explanation === "string"
            ? o.explanation.trim()
            : "",
    }
  }

  if (o.kind === "other") {
    const explanation =
      typeof o.explanation === "string" && o.explanation.trim()
        ? o.explanation.trim()
        : raw
    return { type: "llm", text: explanation }
  }

  return { type: "llm", text: raw }
}

function payloadToDetail(p: LlmPayload): DetailState {
  if (p.kind === "verb") {
    return {
      type: "llm_verb",
      infinitive: p.infinitive,
      tense: p.tense || "—",
      person: p.person || "—",
      contextNote: p.contextNote || "",
    }
  }
  return { type: "llm", text: p.explanation || "" }
}

function detailToCacheValue(d: DetailState): string {
  if (d.type === "llm_verb") {
    const p: LlmVerbPayload = {
      kind: "verb",
      infinitive: d.infinitive,
      tense: d.tense,
      person: d.person,
      contextNote: d.contextNote,
    }
    return JSON.stringify(p)
  }
  const p: LlmOtherPayload = { kind: "other", explanation: d.text }
  return JSON.stringify(p)
}

function cacheValueToDetail(cached: string): DetailState {
  try {
    const p = JSON.parse(cached) as LlmPayload
    if (p && typeof p === "object" && (p.kind === "verb" || p.kind === "other")) {
      return salvageLlmJsonBlob(payloadToDetail(p))
    }
  } catch { /* fall through */ }
  return salvageLlmJsonBlob(parseChunkDetailJson(cached))
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const llmCache = new Map<string, string>()

/** Grammar details: Supabase Edge Function `chunk-details` (Groq key server-side only). */
async function fetchDetailsFromEdge(chunk: string, sentence: string): Promise<DetailState> {
  const res = await fetchChunkDetailsViaEdge(chunk, sentence)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (typeof j?.error === "string") msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  const data = (await res.json()) as Record<string, unknown>
  if (data.kind === "verb" || data.kind === "other") {
    return salvageLlmJsonBlob(payloadToDetail(data as unknown as LlmPayload))
  }
  return { type: "llm", text: "Unexpected response from details service." }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChunkDetails(): ChunkDetailsState {
  const [activeChunk, setActiveChunk] = useState<string | null>(null)
  const [detail,      setDetail]      = useState<DetailState | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const fetchDetails = useCallback((chunk: string, sentence: string) => {
    if (!chunk.trim()) return

    const reqId = ++requestIdRef.current
    setActiveChunk(chunk)
    setError(null)

    const cacheKey = `${chunk}|${sentence}`
    const cached = llmCache.get(cacheKey)
    if (cached) {
      setDetail(cacheValueToDetail(cached))
      setLoading(false)
      return
    }

    setDetail(null)
    setLoading(true)

    fetchDetailsFromEdge(chunk, sentence)
      .then(result => {
        if (requestIdRef.current !== reqId) return
        llmCache.set(cacheKey, detailToCacheValue(result))
        setDetail(result)
        setLoading(false)
      })
      .catch(err => {
        if (requestIdRef.current !== reqId) return
        console.error("[useChunkDetails]", err)
        setError("Could not load details. Check your connection.")
        setLoading(false)
      })
  }, [])

  const close = useCallback(() => {
    requestIdRef.current++
    setActiveChunk(null)
    setDetail(null)
    setLoading(false)
    setError(null)
  }, [])

  return { activeChunk, detail, loading, error, fetchDetails, close }
}
