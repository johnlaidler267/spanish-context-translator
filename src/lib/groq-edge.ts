/**
 * Groq calls go through Supabase Edge Functions so `GROQ_API_KEY` stays server-side only.
 * Guests get a Supabase anonymous session on first use (enable Anonymous in Auth settings).
 */

import { supabase } from "@/lib/supabase"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export async function ensureSessionForGroq(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return
  const { error } = await supabase.auth.signInAnonymously()
  if (error) {
    throw new Error(
      "Could not start a session for translation. " +
        (error.message.toLowerCase().includes("anonymous") ||
        error.message.includes("disabled") ||
        error.message.includes("not allowed")
          ? "Enable Anonymous sign-ins in Supabase → Authentication → Providers."
          : error.message),
    )
  }
}

function jsonHeaders(session: { access_token: string }): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    apikey: anonKey,
  }
}

/** Proxied chat completions (OpenAI-compatible body → Groq). */
export async function fetchGroqChatViaEdge(body: object): Promise<Response> {
  await ensureSessionForGroq()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("No session")
  return fetch(`${supabaseUrl}/functions/v1/groq-chat`, {
    method: "POST",
    headers: jsonHeaders(session),
    body: JSON.stringify(body),
  })
}

export async function transcribeAudioViaEdge(
  audioBlob: Blob,
  filename = "recording.webm",
): Promise<string> {
  await ensureSessionForGroq()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("No session")
  const form = new FormData()
  form.append("file", audioBlob, filename)
  form.append("model", "whisper-large-v3-turbo")
  form.append("language", "es")
  form.append("response_format", "json")
  const res = await fetch(`${supabaseUrl}/functions/v1/groq-transcribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: form,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    if (res.status === 429) {
      let detail = ""
      try {
        const j = JSON.parse(err) as { error?: { message?: string } }
        detail = j?.error?.message ?? ""
      } catch {
        /* ignore */
      }
      throw new Error(
        detail
          ? `Rate limit reached: ${detail}`
          : "Rate limit reached (HTTP 429). Please wait a moment and try again.",
      )
    }
    throw new Error(err || `Transcription failed: ${res.status}`)
  }
  const data = (await res.json()) as { text?: string }
  return (data.text ?? "").trim()
}

/** Chunk grammar/details (same contract as `chunk-details` Edge Function). */
export async function fetchChunkDetailsViaEdge(
  chunk: string,
  sentence: string,
): Promise<Response> {
  await ensureSessionForGroq()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("No session")
  return fetch(`${supabaseUrl}/functions/v1/chunk-details`, {
    method: "POST",
    headers: jsonHeaders(session),
    body: JSON.stringify({ chunk, sentence }),
  })
}
