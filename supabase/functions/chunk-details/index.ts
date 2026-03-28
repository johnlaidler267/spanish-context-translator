/**
 * chunk-details Edge Function
 *
 * POST { chunk: string, sentence?: string }
 * → JSON body: either
 *   { "kind":"verb", "infinitive", "tense", "person", "contextNote" }
 *   or { "kind":"other", "explanation" }
 *
 * The app currently calls Groq from the browser; this function mirrors that
 * contract for server-side / mobile clients. Set GROQ_API_KEY in Supabase secrets.
 */

import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "llama-3.1-8b-instant"
const MAX_TOKENS = 280

const SYSTEM_PROMPT = `You are a Spanish grammar assistant for English speakers reading native Spanish.

You MUST respond with a single JSON object only — no markdown, no code fences, no text before or after.

Two shapes:

1) If the clicked word/phrase is a conjugated finite verb form (e.g. "fue", "había", "dice", "pensaban"), use:
{"kind":"verb","infinitive":"<dictionary infinitive, e.g. ser>","tense":"<e.g. preterite, imperfect, present indicative>","person":"<e.g. third person singular>","contextNote":"<one or two short sentences in plain English: what it means here and why this form>"}

2) Otherwise (nouns, adjectives, adverbs, prepositions, fixed expressions, etc.):
{"kind":"other","explanation":"<2–3 short sentences in plain English: meaning in context, grammatical role, one practical note — no bullets, under 120 words>"}

Rules:
- For "verb", infinitive must be the correct lemma (e.g. fue → ser, hizo → hacer).
- Use clear English labels for tense and person.
- JSON must be valid. Escape quotes inside strings. No trailing commas.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const groqKey = Deno.env.get("GROQ_API_KEY")
  if (!groqKey) {
    console.error("[chunk-details] GROQ_API_KEY not set")
    return new Response(
      JSON.stringify({ error: "Service misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
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
