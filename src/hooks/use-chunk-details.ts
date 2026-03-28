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

function parseChunkDetailJson(raw: string): DetailState {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    return { type: "llm", text: raw }
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
      return payloadToDetail(p)
    }
  } catch { /* fall through */ }
  return parseChunkDetailJson(cached)
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const llmCache = new Map<string, string>()

// ─── Groq ─────────────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_MODEL   = "llama-3.1-8b-instant"

const SYSTEM_PROMPT = `You are a Spanish grammar assistant for English speakers reading native Spanish.

You MUST respond with a single JSON object only — no markdown, no code fences, no text before or after.

Use kind "verb" for any Spanish verb form that maps to an infinitive lemma — including finite tenses, gerunds (-ando/-iendo), infinitives, and participles when they are verb forms in context (not when the same word is purely a noun/adjective, e.g. "vino" the drink → other).

Shape for verb:
{"kind":"verb","infinitive":"…","tense":"…","person":"…","contextNote":"…"}
- person: use clear labels for finite verbs ("third person singular"). For gerunds, infinitives, and participles used non-finitely, use "non-finite".
- tense: e.g. "preterite", "present indicative", "imperfect subjunctive", "gerund", "infinitive", "past participle".

Examples (format only — answer the actual user click, do not echo these unless they match):
- "fue"      → {"kind":"verb","infinitive":"ser / ir","tense":"preterite","person":"3sg","contextNote":"Ambiguous — identical preterite form for both ser and ir. Disambiguated by context."}
- "marcaba"  → {"kind":"verb","infinitive":"marcar","tense":"imperfect","person":"3sg","contextNote":"Ongoing or habitual past action."}
- "mesa"     → {"kind":"noun","gender":"feminine","explanation":"Common noun. 'la mesa' = the table. No verbal analysis applies."}
- "creyendo" → {"kind":"verb","infinitive":"creer","tense":"gerund","person":"non-finite","contextNote":"…"}
- "diciendo" → {"kind":"verb","infinitive":"decir","tense":"gerund","person":"non-finite","contextNote":"…"}
- "habrían"  → {"kind":"verb","infinitive":"haber","tense":"conditional","person":"3pl","contextNote":"Almost always auxiliary in conditional perfect construction: habrían + past participle."}
- "guardara" → {"kind":"verb","infinitive":"guardar","tense":"imperfect subjunctive","person":"1sg or 3sg","contextNote":"Triggered by past main clause requiring subjunctive. Expresses desired, hypothetical, or contingent action."}
- "habla"         → {"kind":"verb","infinitive":"hablar","tense":"present indicative","person":"3sg","contextNote":"Simple present or habitual action."}
- "hablará"       → {"kind":"verb","infinitive":"hablar","tense":"future","person":"3sg","contextNote":"Future certainty, or conjecture about the present ('will speak / must be speaking')."}
- "ha hablado"    → {"kind":"verb","infinitive":"hablar","tense":"present perfect","person":"3sg","contextNote":"Completed action with present relevance. More common in Spain than Latin America."}
- "había hablado" → {"kind":"verb","infinitive":"hablar","tense":"pluperfect","person":"3sg","contextNote":"Action completed before another past event."}
- "habría hablado"→ {"kind":"verb","infinitive":"hablar","tense":"conditional perfect","person":"3sg","contextNote":"Hypothetical completed past action; often in si-clause results: 'would have spoken'."}
- "hable"         → {"kind":"verb","infinitive":"hablar","tense":"present subjunctive","person":"1sg or 3sg","contextNote":"Triggered by present/future main clause requiring subjunctive."}
- "hubiera hablado"→{"kind":"verb","infinitive":"hablar","tense":"pluperfect subjunctive","person":"1sg or 3sg","contextNote":"Hypothetical or counterfactual past; common in si-clauses: 'si hubiera hablado…'"}
- "hablado"       → {"kind":"verb","infinitive":"hablar","tense":"past participle","person":"non-finite","contextNote":"Used with haber to form compound tenses, or as adjective agreeing with noun."}
- "habla / hablen"→ {"kind":"verb","infinitive":"hablar","tense":"imperative","person":"2sg informal / 3pl formal","contextNote":"Direct command. Negative imperatives use subjunctive instead."}
{"kind":"other","explanation":"<2–3 short sentences in plain English: meaning in context, role, one practical note — no bullets, under 120 words>"}

Rules:
- Correct lemma (hizo→hacer, quiso→querer, traduje→traducir, creyendo→creer).
- JSON must be valid. Escape quotes inside strings. No trailing commas.`

async function callGroqForChunk(chunk: string, sentence: string): Promise<DetailState> {
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
      max_tokens: 280,
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body.error?.message ?? `Groq error: HTTP ${res.status}`)
  }

  type GroqResponse = { choices?: Array<{ message?: { content?: string } }> }
  const data = await res.json() as GroqResponse
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ""
  return parseChunkDetailJson(raw)
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

    callGroqForChunk(chunk, sentence)
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
