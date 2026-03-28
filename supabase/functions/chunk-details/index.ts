/**
 * chunk-details Edge Function
 *
 * POST { chunk: string, sentence: string }
 * → { detail: string }
 *
 * Calls Groq with a fast small model to produce a 2–3 sentence grammar explanation
 * of the given Spanish word/phrase in the context of its surrounding sentence.
 *
 * Auth is optional — unauthenticated (guest) users are allowed since we rely on
 * the client-side static lookup as the first gate.
 *
 * Set GROQ_API_KEY in Supabase project secrets.
 */

import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "llama-3.1-8b-instant"
const MAX_TOKENS = 160

const SYSTEM_PROMPT = `You are a concise Spanish grammar tutor helping an English speaker understand a Spanish text.

When given a Spanish word or short phrase and the sentence it appears in, explain in 2–3 short sentences:
1. What it means in this specific context.
2. Its grammatical form (e.g., tense, mood, person for verbs; or word class for others).
3. One practical usage note — why this form or word is used here, not a generic definition.

Rules:
- Write in plain English. No markdown, no bullet points, no headers.
- Be direct and specific. Avoid padding like "Great question!" or "In Spanish, …"
- 2–3 sentences maximum. Stay under 120 words.`

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
      temperature: 0.3,
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
  const detail = data.choices?.[0]?.message?.content?.trim() ?? ""

  return new Response(
    JSON.stringify({ detail }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
