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
import {
  getStoredLanguageLearningPreferences,
  type LanguageLearningPreferences,
} from "@/lib/storage/language-learning-preferences"

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
  /** The raw target-language text of the currently selected chunk. */
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

// ─── Errors ───────────────────────────────────────────────────────────────────

/** A non-OK response from the chunk-details function (status kept for the user-facing message). */
export class DetailsRequestError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * What the details sheet says when a lookup fails. Every failure used to read "Check your
 * connection", which hid rate limits, expired sessions and server errors behind a network hint.
 */
export function detailsErrorMessage(err: unknown): string {
  if (err instanceof DetailsRequestError) {
    const msg = err.message.toLowerCase()
    if (err.status === 429 || msg.includes("429") || msg.includes("rate limit")) {
      return "Too many lookups right now. Wait a moment and tap the word again."
    }
    if (err.status === 401) return "Your session expired. Refresh the page and try again."
    return `Couldn't load details (${err.message}). Try again in a moment.`
  }
  if (err instanceof TypeError) {
    // fetch() itself rejected: offline, DNS, or the server refused the browser's origin (CORS).
    return "Couldn't reach the details service. Check your connection and try again."
  }
  const msg = err instanceof Error && err.message ? err.message : "unknown error"
  return `Couldn't load details (${msg}).`
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const llmCache = new Map<string, string>()

/** Grammar details: Supabase Edge Function `chunk-details` (Groq key server-side only). */
async function fetchDetailsFromEdge(
  chunk: string,
  sentence: string,
  prefs: LanguageLearningPreferences,
): Promise<DetailState> {
  const res = await fetchChunkDetailsViaEdge(chunk, sentence, prefs)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (typeof j?.error === "string") msg = j.error
    } catch {
      /* ignore */
    }
    throw new DetailsRequestError(msg, res.status)
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

    const prefs = getStoredLanguageLearningPreferences()
    // Language pair is part of the key: the same string can be a different word (and explained
    // in a different language) after the learner switches languages.
    const cacheKey = `${prefs.learning}|${prefs.native}|${chunk}|${sentence}`
    const cached = llmCache.get(cacheKey)
    if (cached) {
      setDetail(cacheValueToDetail(cached))
      setLoading(false)
      return
    }

    setDetail(null)
    setLoading(true)

    fetchDetailsFromEdge(chunk, sentence, prefs)
      .then(result => {
        if (requestIdRef.current !== reqId) return
        llmCache.set(cacheKey, detailToCacheValue(result))
        setDetail(result)
        setLoading(false)
      })
      .catch(err => {
        if (requestIdRef.current !== reqId) return
        console.error("[useChunkDetails]", err)
        setError(detailsErrorMessage(err))
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
