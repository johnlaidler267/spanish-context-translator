/**
 * Proxies audio to Groq Whisper. Requires a valid Supabase JWT. GROQ_API_KEY in secrets only.
 */

import { requireAuthUser, jsonError } from "../_shared/auth-user.ts"
import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

const GROQ_TRANSCRIBE = "https://api.groq.com/openai/v1/audio/transcriptions"
const MAX_BYTES = 12 * 1024 * 1024

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const auth = await requireAuthUser(req)
  if (auth instanceof Response) return auth

  const groqKey = Deno.env.get("GROQ_API_KEY")
  if (!groqKey) {
    console.error("[groq-transcribe] GROQ_API_KEY not set")
    return jsonError("Service misconfigured", 500)
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError("Expected multipart form data", 400)
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return jsonError("file field required", 400)
  }
  if (file.size > MAX_BYTES) {
    return jsonError("File too large", 413)
  }

  const out = new FormData()
  out.append("file", file, file.name || "audio.webm")
  out.append("model", (form.get("model") as string) || "whisper-large-v3-turbo")
  out.append("language", (form.get("language") as string) || "es")
  out.append("response_format", (form.get("response_format") as string) || "json")

  const groqRes = await fetch(GROQ_TRANSCRIBE, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: out,
  })

  const text = await groqRes.text()
  return new Response(text, {
    status: groqRes.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
