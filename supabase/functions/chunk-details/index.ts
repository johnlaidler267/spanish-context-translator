/**
 * chunk-details Edge Function
 *
 * POST { chunk: string, sentence?: string }
 * → JSON body: either
 *   { "kind":"verb", "infinitive", "tense", "person", "contextNote" }
 *   or { "kind":"other", "explanation" }
 *
 * Requires a valid Supabase JWT (signed-in or anonymous). Set GROQ_API_KEY in secrets.
 */

import { requireAuthUser, jsonError } from "../_shared/auth-user.ts"
import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "llama-3.1-8b-instant"
const MAX_TOKENS = 280

const SYSTEM_PROMPT = `You are a Spanish grammar assistant for English speakers reading native Spanish.

You MUST respond with a single JSON object only — no markdown, no code fences, no text before or after.

Use kind "verb" for any Spanish verb form that maps to an infinitive lemma — including finite tenses, gerunds (-ando/-iendo), infinitives, and participles when they are verb forms in context (not when the same word is purely a noun/adjective, e.g. "vino" the drink → other).

Shape for verb:
{"kind":"verb","infinitive":"…","tense":"…","person":"…","contextNote":"…"}
- person: clear labels for finite verbs ("third person singular"). For gerunds, infinitives, non-finite participles use "non-finite".
- tense: e.g. "preterite", "present indicative", "imperfect subjunctive", "gerund", "infinitive", "past participle".

Examples (format only — answer the actual user click):
- "fue" → {"kind":"verb","infinitive":"ser","tense":"preterite","person":"third person singular","contextNote":"…"}
- "creyendo" → {"kind":"verb","infinitive":"creer","tense":"gerund","person":"non-finite","contextNote":"…"}
- "diciendo" → {"kind":"verb","infinitive":"decir","tense":"gerund","person":"non-finite","contextNote":"…"}
- "habrían" → {"kind":"verb","infinitive":"haber","tense":"conditional","person":"third person plural","contextNote":"…"}
- "mesa" → {"kind":"other","explanation":"…"}

Shape for non-verb tokens:
{"kind":"other","explanation":"<2–3 short sentences in plain English — no bullets, under 120 words>"}

Rules:
- Correct lemma (hizo→hacer, creyendo→creer).
- JSON must be valid. Escape quotes inside strings. No trailing commas.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const auth = await requireAuthUser(req)
  if (auth instanceof Response) return auth

  const groqKey = Deno.env.get("GROQ_API_KEY")
  if (!groqKey) {
    console.error("[chunk-details] GROQ_API_KEY not set")
    return jsonError("Service misconfigured", 500)
  }

  let body: { chunk?: string; sentence?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const chunk    = (body.chunk    ?? "").trim()
  const sentence = (body.sentence ?? "").trim()

  if (!chunk) {
    return new Response(
      JSON.stringify({ error: "chunk is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const userMessage = sentence
    ? `Word/phrase: "${chunk}"\nFull sentence: "${sentence}"`
    : `Word/phrase: "${chunk}"`

  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
    }),
  })

  if (!groqRes.ok) {
    const text = await groqRes.text().catch(() => "")
    console.error(`[chunk-details] Groq error ${groqRes.status}: ${text}`)
    return new Response(
      JSON.stringify({ error: `Groq error: ${groqRes.status}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  type GroqResponse = {
    choices?: Array<{ message?: { content?: string } }>
  }

  const data = (await groqRes.json()) as GroqResponse
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ""

  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (parsed?.kind === "verb" || parsed?.kind === "other") {
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  } catch {
    /* fall through */
  }

  return new Response(
    JSON.stringify({ kind: "other", explanation: raw || "No explanation returned." }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
