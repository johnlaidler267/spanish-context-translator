/**
 * useChunkDetails
 *
 * Provides `fetchDetails(chunk, sentence)` and the resulting state.
 *
 * Decision order:
 *  1. In-memory cache (instant)
 *  2. Static lookup via chunk-details.ts / @jirimracek/conjugate-esp (sync, < 1 ms after first call)
 *  3. LLM edge function fallback (~200 ms)
 *
 * The returned `detail` is a structured object that <DetailsBox> renders.
 */

import { useCallback, useRef, useState } from "react"
import { lookupChunk, type StaticDetail, type VerbFormInfo } from "@/lib/chunk-details"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DetailState =
  | { type: "static"; data: StaticDetail }
  | { type: "llm";    text: string }

export interface ChunkDetailsState {
  /** The raw Spanish text of the currently selected chunk. */
  activeChunk: string | null
  detail:      DetailState | null
  loading:     boolean
  error:       string | null
  /** Open the details box for a chunk. Triggers lookup + optional LLM. */
  fetchDetails: (chunk: string, sentence: string) => void
  /** Dismiss / close the details box. */
  close: () => void
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/** Keyed by `chunk|sentence` for LLM results; `chunk` alone for static hits. */
const llmCache = new Map<string, string>()

// ─── Direct Groq call (mirrors translate.ts pattern) ─────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_MODEL   = "llama-3.1-8b-instant"

const SYSTEM_PROMPT =
  `You are a concise Spanish grammar tutor helping an English speaker read native Spanish text.

When given a Spanish word or short phrase and the sentence it appears in, explain in 2–3 short sentences:
1. What it means in this specific context.
2. Its grammatical form (tense, mood, person for verbs; word class for others).
3. One practical note — why this form appears here, not a generic definition.

Rules: plain English, no markdown, no bullet points, 2–3 sentences max, under 120 words.`

async function callGroqDirectly(chunk: string, sentence: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string
  if (!apiKey) throw new Error("VITE_GROQ_API_KEY not set")

  const userMessage = sentence
    ? `Word/phrase: "${chunk}"\nFull sentence: "${sentence}"`
    : `Word/phrase: "${chunk}"`

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      max_tokens: 160,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body.error?.message ?? `Groq error: HTTP ${res.status}`)
  }

  type GroqResponse = { choices?: Array<{ message?: { content?: string } }> }
  const data = await res.json() as GroqResponse
  return data.choices?.[0]?.message?.content?.trim() ?? ""
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChunkDetails(): ChunkDetailsState {
  const [activeChunk, setActiveChunk] = useState<string | null>(null)
  const [detail,      setDetail]      = useState<DetailState | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  /** Tracks in-flight request so stale responses from previous clicks are dropped. */
  const requestIdRef = useRef(0)

  const fetchDetails = useCallback((chunk: string, sentence: string) => {
    if (!chunk.trim()) return

    const reqId = ++requestIdRef.current
    setActiveChunk(chunk)
    setError(null)

    // 1. Static lookup (synchronous — may trigger reverse-map build on first call)
    const staticResult = lookupChunk(chunk)
    if (staticResult) {
      setDetail({ type: "static", data: staticResult })
      setLoading(false)
      return
    }

    // 2. LLM cache hit
    const cacheKey = `${chunk}|${sentence}`
    const cached = llmCache.get(cacheKey)
    if (cached) {
      setDetail({ type: "llm", text: cached })
      setLoading(false)
      return
    }

    // 3. LLM edge function
    setDetail(null)
    setLoading(true)

    callGroqDirectly(chunk, sentence)
      .then(text => {
        if (requestIdRef.current !== reqId) return // stale
        llmCache.set(cacheKey, text)
        setDetail({ type: "llm", text })
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
    requestIdRef.current++ // cancel any in-flight request
    setActiveChunk(null)
    setDetail(null)
    setLoading(false)
    setError(null)
  }, [])

  return { activeChunk, detail, loading, error, fetchDetails, close }
}

// ─── Formatting helpers (used by DetailsBox) ─────────────────────────────────

/** Collapse duplicate verb form entries to show unique infinitives only. */
export function groupFormsByInfinitive(
  forms: VerbFormInfo[],
): Map<string, VerbFormInfo[]> {
  const map = new Map<string, VerbFormInfo[]>()
  for (const f of forms) {
    let arr = map.get(f.infinitive)
    if (!arr) { arr = []; map.set(f.infinitive, arr) }
    arr.push(f)
  }
  return map
}
