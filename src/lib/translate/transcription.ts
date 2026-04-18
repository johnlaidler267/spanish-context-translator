import { transcribeAudioViaEdge } from "@/lib/groq-edge"

/** Spanish-first speech-to-text via Groq Whisper (proxied through Edge Function). */
export async function transcribeAudioWithGroq(
  audioBlob: Blob,
  filename = "recording.webm",
): Promise<string> {
  return transcribeAudioViaEdge(audioBlob, filename)
}

/** Join transcribed phrase to existing textarea value with a space when needed */
export function appendTranscriptToField(previous: string, addition: string): string {
  const add = addition.trim()
  if (!add) return previous
  const prev = previous
  if (!prev.trim()) return add
  const needsSpace = !/\s$/.test(prev) && !/^\s/.test(add)
  return prev + (needsSpace ? " " : "") + add
}
