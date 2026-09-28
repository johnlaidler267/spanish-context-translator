import { transcribeAudioViaEdge } from "@/lib/groq-edge"
import {
  getStoredLanguageLearningPreferences,
  type LearningLanguage,
} from "@/lib/storage/language-learning-preferences"

/** ISO-639-1 code Whisper expects for each "I'm learning" language. */
export const WHISPER_LANGUAGE: Record<LearningLanguage, string> = {
  spanish: "es",
  french: "fr",
  english: "en",
}

/** Speech-to-text in the language being learned, via Groq Whisper (proxied through Edge Function). */
export async function transcribeAudioWithGroq(
  audioBlob: Blob,
  filename = "recording.webm",
): Promise<string> {
  const { learning } = getStoredLanguageLearningPreferences()
  return transcribeAudioViaEdge(audioBlob, filename, WHISPER_LANGUAGE[learning])
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
