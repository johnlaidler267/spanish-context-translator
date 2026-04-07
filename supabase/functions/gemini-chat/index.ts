/**
 * Proxies chat-style requests to Gemini `generateContent`, returns OpenAI-shaped JSON
 * so the app can swap providers without changing parsers. Requires a valid Supabase JWT.
 * Set GEMINI_API_KEY in Supabase secrets — never expose it in the browser.
 */

import { requireAuthUser, jsonError } from "../_shared/auth-user.ts"
import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

/** Allowlist — keep in sync with `translate.ts` Gemini model env defaults. */
const ALLOWED_MODELS = new Set([
  "gemini-3-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-001",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
])

const MAX_OUTPUT_TOKENS_CAP = 8192

type OpenAiMsg = { role?: string; content?: unknown }

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part !== null && typeof part === "object" && "text" in part) {
          const t = (part as { text?: unknown }).text
          return typeof t === "string" ? t : ""
        }
        return ""
      })
      .join("")
  }
  return ""
}

function openAiMessagesToGemini(messages: OpenAiMsg[]): {
  systemInstruction?: { parts: Array<{ text: string }> }
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>
} {
  let systemText = ""
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = []
  for (const m of messages) {
    const role = typeof m.role === "string" ? m.role : ""
    const text = stringifyContent(m.content)
    if (role === "system") {
      systemText += (systemText ? "\n\n" : "") + text
    } else if (role === "user") {
      contents.push({ role: "user", parts: [{ text }] })
    } else if (role === "assistant") {
      contents.push({ role: "model", parts: [{ text }] })
    }
  }
  return {
    systemInstruction: systemText
      ? { parts: [{ text: systemText }] }
      : undefined,
    contents,
  }
}

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

  const maxOut = Math.min(
    typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 4096,
    MAX_OUTPUT_TOKENS_CAP,
  )

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    console.error("[gemini-chat] GEMINI_API_KEY not set")
    return jsonError("Service misconfigured", 500)
  }

  const { systemInstruction, contents } = openAiMessagesToGemini(body.messages as OpenAiMsg[])
  if (contents.length === 0) {
    return jsonError("No user/assistant messages to send", 400)
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent`

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxOut,
      ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  }
  if (systemInstruction) geminiBody.systemInstruction = systemInstruction

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
    return new Response(rawText, {
      status: geminiRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
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
    return new Response(JSON.stringify({ error: { message: data.error.message } }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const parts = data.candidates?.[0]?.content?.parts
  const assistantText = parts?.map((p) => p.text ?? "").join("") ?? ""
  if (!assistantText.trim()) {
    const reason = data.promptFeedback?.blockReason ?? "empty"
    return new Response(
      JSON.stringify({
        error: {
          message: `Gemini returned no text (finish/block: ${reason}).`,
        },
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const openAiShaped = {
    choices: [
      {
        message: {
          role: "assistant",
          content: assistantText,
        },
      },
    ],
  }

  return new Response(JSON.stringify(openAiShaped), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
