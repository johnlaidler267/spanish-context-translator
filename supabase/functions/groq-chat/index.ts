/**
 * Proxies OpenAI-compatible chat completions to Groq. Requires a valid Supabase JWT
 * (signed-in or anonymous). Set GROQ_API_KEY in Supabase secrets — never expose it in the browser.
 */

import { requireAuthUser, jsonError } from "../_shared/auth-user.ts"
import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

/** Keep in sync with `GROQ_TRANSLATE_MODEL` / `GROQ_LEARN_MODEL` in `src/lib/translate/llm-settings.ts`. */
const ALLOWED_MODELS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
])

const MAX_TOKENS_CAP = 8192

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const auth = await requireAuthUser(req)
  if (auth instanceof Response) return auth

  let body: {
    model?: string
    messages?: unknown
    temperature?: number
    max_tokens?: number
    reasoning_effort?: string
    /** GPT-OSS / Qwen reasoning: `hidden` = only final answer in content (see Groq reasoning docs). */
    reasoning_format?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  if (!body.model || !ALLOWED_MODELS.has(body.model)) {
    return jsonError("Model not allowed", 400)
  }
  if (!Array.isArray(body.messages)) {
    return jsonError("messages array required", 400)
  }

  const maxTokens = Math.min(
    typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 4096,
    MAX_TOKENS_CAP,
  )

  const groqKey = Deno.env.get("GROQ_API_KEY")
  if (!groqKey) {
    console.error("[groq-chat] GROQ_API_KEY not set")
    return jsonError("Service misconfigured", 500)
  }

  const payload: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    max_tokens: maxTokens,
  }
  if (typeof body.temperature === "number") payload.temperature = body.temperature
  if (body.reasoning_effort != null && body.reasoning_effort !== "") {
    payload.reasoning_effort = body.reasoning_effort
  }
  if (body.reasoning_format != null && body.reasoning_format !== "") {
    payload.reasoning_format = body.reasoning_format
  }

  const groqRes = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify(payload),
  })

  const text = await groqRes.text()
  return new Response(text, {
    status: groqRes.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
