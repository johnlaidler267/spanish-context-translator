/**
 * chunk-details Edge Function
 *
 * POST { chunk: string, sentence?: string, learning?: "spanish"|"french"|"english", native?: same }
 *   (learning defaults to "spanish", native to "english" — older clients omit them)
 * → JSON body: either
 *   { "kind":"verb", "infinitive", "tense", "person", "contextNote" }
 *   or { "kind":"other", "explanation" }
 *
 * Requires a valid Supabase JWT (signed-in or anonymous). Set GROQ_API_KEY in secrets.
 */

import { enforceAiRateLimit } from "../_shared/ai-rate-limit.ts"
import { requireAuthUser, jsonError } from "../_shared/auth-user.ts"
import { corsHeaders, serveWithCors } from "../_shared/cors.ts"
import { LANGUAGE_NAME, parseLanguagePair, type Language } from "../_shared/languages.ts"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "openai/gpt-oss-20b"
// gpt-oss reasons before answering and those tokens count against max_tokens. At 280 the
// reasoning could use the whole budget, leaving empty content that Groq's JSON mode rejects
// with a 400 json_validate_failed. Keep reasoning low and leave room for it plus the answer.
const MAX_TOKENS = 1000
const REASONING_EFFORT = "low"

/** Per target language: what counts as a verb form, and few-shot examples in that language. */
const TARGET_GUIDANCE: Record<Language, { verbForms: string; examples: string }> = {
  spanish: {
    verbForms:
      `finite tenses, gerunds (-ando/-iendo), infinitives, and participles when they are verb forms in context (not when the same word is purely a noun/adjective, e.g. "vino" the drink → other)`,
    examples: `- "fue" → {"kind":"verb","infinitive":"ser","tense":"preterite","person":"third person singular","contextNote":"…"}
- "creyendo" → {"kind":"verb","infinitive":"creer","tense":"gerund","person":"non-finite","contextNote":"…"}
- "diciendo" → {"kind":"verb","infinitive":"decir","tense":"gerund","person":"non-finite","contextNote":"…"}
- "habrían" → {"kind":"verb","infinitive":"haber","tense":"conditional","person":"third person plural","contextNote":"…"}
- "mesa" → {"kind":"other","explanation":"…"}`,
  },
  french: {
    verbForms:
      `finite tenses (including passé composé and other compound tenses — lemma is the main verb, not the auxiliary), present participles (-ant), infinitives, and past participles when they are verb forms in context (not when the same word is purely a noun/adjective, e.g. "été" the summer → other)`,
    examples: `- "fut" → {"kind":"verb","infinitive":"être","tense":"passé simple","person":"third person singular","contextNote":"…"}
- "a pris" → {"kind":"verb","infinitive":"prendre","tense":"passé composé","person":"third person singular","contextNote":"…"}
- "croyant" → {"kind":"verb","infinitive":"croire","tense":"present participle","person":"non-finite","contextNote":"…"}
- "auraient" → {"kind":"verb","infinitive":"avoir","tense":"conditional","person":"third person plural","contextNote":"…"}
- "table" → {"kind":"other","explanation":"…"}`,
  },
  english: {
    verbForms:
      `finite tenses, -ing forms used as verbs, infinitives, and participles when they are verb forms in context (not when the same word is purely a noun/adjective, e.g. "saw" the tool → other)`,
    examples: `- "went" → {"kind":"verb","infinitive":"go","tense":"simple past","person":"third person singular","contextNote":"…"}
- "believing" → {"kind":"verb","infinitive":"believe","tense":"present participle","person":"non-finite","contextNote":"…"}
- "would have" → {"kind":"verb","infinitive":"have","tense":"conditional","person":"third person plural","contextNote":"…"}
- "table" → {"kind":"other","explanation":"…"}`,
  },
}

function buildSystemPrompt(learning: Language, native: Language): string {
  const target = LANGUAGE_NAME[learning]
  const nativeName = LANGUAGE_NAME[native]
  const g = TARGET_GUIDANCE[learning]
  return `You are a ${target} grammar assistant for ${nativeName} speakers reading native ${target}.

You MUST respond with a single JSON object only — no markdown, no code fences, no text before or after.

Use kind "verb" for any ${target} verb form that maps to an infinitive lemma — including ${g.verbForms}.

Shape for verb:
{"kind":"verb","infinitive":"…","tense":"…","person":"…","contextNote":"…"}
- person: clear labels for finite verbs ("third person singular"). For participles, infinitives and other non-finite forms use "non-finite".
- tense: the standard grammatical name for the form.
- Write tense, person and contextNote in ${nativeName}; the infinitive stays in ${target}.

Examples (format only — answer the actual user click; labels shown in English):
${g.examples}

Shape for non-verb tokens:
{"kind":"other","explanation":"<2–3 short sentences in plain ${nativeName} — no bullets, under 120 words>"}

Rules:
- Describe ONLY the clicked word/phrase. The sentence is context; do not analyse its other words.
- Respond with exactly one JSON object, never an array.
- Correct lemma for the ${target} form.
- JSON must be valid. Escape any double quotes inside string values, or avoid them: use single quotes for glosses instead of double quotes around foreign words.
- No trailing commas.`
}

/** When the model omits escapes inside explanation, JSON.parse fails; recover prose if the tail still closes with "}. */
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

/**
 * Coerce a parsed reply into one of the two shapes. The model sometimes wraps the answer in an
 * array or, worse, returns one object per verb in the sentence; anything we can't map to a
 * single answer returns null so the caller retries instead of shipping raw JSON to the sheet.
 */
function normalizePayload(parsed: unknown): Record<string, unknown> | null {
  if (Array.isArray(parsed)) return parsed.length === 1 ? normalizePayload(parsed[0]) : null
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  if (o.kind === "verb" || o.kind === "other") return o
  if (typeof o.explanation === "string" && o.explanation.trim()) {
    return { kind: "other", explanation: o.explanation }
  }
  return null
}

serveWithCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const auth = await requireAuthUser(req)
  if (auth instanceof Response) return auth
  const limited = await enforceAiRateLimit(req, auth.id, "chunk-details")
  if (limited) return limited

  const groqKey = Deno.env.get("GROQ_API_KEY")
  if (!groqKey) {
    console.error("[chunk-details] GROQ_API_KEY not set")
    return jsonError("Service misconfigured", 500)
  }

  let body: { chunk?: string; sentence?: string; learning?: unknown; native?: unknown }
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
  const { learning, native } = parseLanguagePair(body.learning, body.native)

  if (!chunk) {
    return new Response(
      JSON.stringify({ error: "chunk is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const userMessage = sentence
    ? `Word/phrase: "${chunk}"\nFull sentence: "${sentence}"`
    : `Word/phrase: "${chunk}"`

  const callGroq = (jsonMode: boolean, correction?: string) =>
    fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(learning, native) },
          { role: "user",   content: userMessage },
          ...(correction ? [{ role: "user", content: correction }] : []),
        ],
        max_tokens: MAX_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        temperature: 0.2,
        // Groq validates JSON syntax; avoids invalid payloads when the model forgets to escape " inside strings.
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    })

  let groqRes = await callGroq(true)

  // JSON mode answers a malformed or empty generation with a 400 instead of returning it.
  // Retry once without it; the lenient parsing below copes with imperfect JSON.
  if (groqRes.status === 400) {
    const text = await groqRes.text().catch(() => "")
    if (!text.includes("json_validate_failed")) {
      console.error(`[chunk-details] Groq error 400: ${text}`)
      return new Response(
        JSON.stringify({ error: "Groq error: 400" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
    console.warn(`[chunk-details] JSON mode rejected the generation, retrying without it: ${text}`)
    groqRes = await callGroq(false)
  }

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

  const readContent = async (res: Response) => {
    const data = (await res.json()) as GroqResponse
    return data.choices?.[0]?.message?.content?.trim() ?? ""
  }
  const tryParse = (text: string) => {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    try {
      return normalizePayload(JSON.parse(cleaned))
    } catch {
      return null
    }
  }
  const ok = (payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  let raw = await readContent(groqRes)
  let payload = tryParse(raw)

  // Valid JSON in the wrong shape (e.g. an array covering every verb in the sentence): ask once more.
  if (!payload && !extractOtherExplanationLenient(raw)) {
    console.warn(`[chunk-details] Unusable reply, retrying: ${raw.slice(0, 300)}`)
    const retry = await callGroq(
      true,
      `Answer again about "${chunk}" only, as one JSON object in the shape described — not an array.`,
    )
    if (retry.ok) {
      raw = await readContent(retry)
      payload = tryParse(raw)
    }
  }
  if (payload) return ok(payload)

  const salvaged = extractOtherExplanationLenient(raw)
  if (salvaged) return ok({ kind: "other", explanation: salvaged })

  // Never pass raw model output through as prose; it shows up in the sheet as a JSON dump.
  console.error(`[chunk-details] Unusable reply after retry: ${raw.slice(0, 300)}`)
  return new Response(
    JSON.stringify({ error: "The details service gave an unreadable answer" }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
