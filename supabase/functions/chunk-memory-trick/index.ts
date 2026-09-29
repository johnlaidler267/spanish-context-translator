/**
 * chunk-memory-trick Edge Function
 *
 * POST { word, learning?, native? }   (language pair defaults to spanish/english)
 * → { "trick": "<2–3 short sentences in the learner's native language>" }
 *
 * Only the word/phrase is sent to the model (no article or grammar context).
 * Uses Gemini Flash (controlled JSON). Requires a valid Supabase JWT.
 * Set GEMINI_API_KEY in Supabase secrets. Optional: GEMINI_MEMORY_TRICK_MODEL (default gemini-2.5-flash-lite).
 */

import { requireAuthUser, jsonError } from "../_shared/auth-user.ts"
import { corsHeaders, serveWithCors } from "../_shared/cors.ts"
import { LANGUAGE_NAME, parseLanguagePair, type Language } from "../_shared/languages.ts"

const GEMINI_GENERATE =
  "https://generativelanguage.googleapis.com/v1beta/models"

/** Default — aligned with `gemini-chat` / app translate defaults. Override via GEMINI_MEMORY_TRICK_MODEL if needed. */
const DEFAULT_MODEL = "gemini-2.5-flash-lite"
const MAX_OUTPUT_TOKENS = 512

const TRICK_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    trick: {
      type: "string",
      description: "Plain-language memory hook for the word or phrase.",
    },
  },
  required: ["trick"],
} as const

function buildSystemPrompt(learning: Language, native: Language): string {
  const target = LANGUAGE_NAME[learning]
  const nativeName = LANGUAGE_NAME[native]
  return `You are a vocabulary coach helping ${nativeName} speakers learning ${target}.

The learner will send only a ${target} word or short phrase — no definition and no surrounding sentence. Use your own knowledge of ${target} to briefly explain the word's origin or internal logic: etymology, root, or the conceptual link between form and meaning.

The structured output field "trick" must be 2–3 sentences in plain ${nativeName}. No preamble or label. Do not use HTML or markdown — plain text only.`
}

function extractTrickLenient(raw: string): string | null {
  const needle = '"trick":"'
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

serveWithCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const auth = await requireAuthUser(req)
  if (auth instanceof Response) return auth

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    console.error("[chunk-memory-trick] GEMINI_API_KEY not set")
    return jsonError("Service misconfigured", 500)
  }

  const model = (Deno.env.get("GEMINI_MEMORY_TRICK_MODEL") ?? "").trim() || DEFAULT_MODEL

  let body: { word?: string; learning?: unknown; native?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const word = (body.word ?? "").trim()

  if (!word) {
    return new Response(
      JSON.stringify({ error: "word is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const { learning, native } = parseLanguagePair(body.learning, body.native)
  const userMessage = `${LANGUAGE_NAME[learning]} word or phrase: "${word}"`

  const url = `${GEMINI_GENERATE}/${model}:generateContent`

  const geminiBody: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(learning, native) }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.75,
      responseMimeType: "application/json",
      responseSchema: TRICK_RESPONSE_SCHEMA,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  }

  const geminiRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(geminiBody),
  })

  const rawText = await geminiRes.text()
  if (!geminiRes.ok) {
    console.error(`[chunk-memory-trick] Gemini error ${geminiRes.status}: ${rawText}`)
    return new Response(
      JSON.stringify({ error: `Gemini error: ${geminiRes.status}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  let data: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    promptFeedback?: { blockReason?: string }
    error?: { message?: string }
  }
  try {
    data = JSON.parse(rawText) as typeof data
  } catch {
    return jsonError("Invalid response from Gemini", 502)
  }

  if (data.error?.message) {
    return new Response(JSON.stringify({ error: data.error.message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const parts = data.candidates?.[0]?.content?.parts
  const assistantText = parts?.map((p) => p.text ?? "").join("") ?? ""
  const raw = assistantText.trim()

  if (!raw) {
    const reason = data.promptFeedback?.blockReason ?? "empty"
    return new Response(
      JSON.stringify({
        error: `Gemini returned no text (finish/block: ${reason}).`,
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    const trick = typeof parsed?.trick === "string" ? parsed.trick.trim() : ""
    if (trick) {
      return new Response(JSON.stringify({ trick }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  } catch {
    /* fall through */
  }

  const salvaged = extractTrickLenient(cleaned)
  const trick = salvaged ?? (raw || "No memory tip returned.")

  return new Response(JSON.stringify({ trick }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
