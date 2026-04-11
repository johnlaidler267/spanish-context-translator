/** Web Speech API — browser TTS for hover exploration (no API key). */
export const HOVER_TTS_LANG = "es-MX"

export function cancelHoverSpeech(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

/**
 * Call from a click/tap handler before enabling hover TTS.
 * Safari/WebKit often leaves the synthesis queue “paused” and loads voices lazily until `getVoices()` runs.
 */
export function primeSpeechSynthesisFromUserGesture(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const s = window.speechSynthesis
  s.cancel()
  s.resume()
  s.getVoices()
}

export function speakHoverChunk(text: string, lang: string = HOVER_TTS_LANG): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const t = text.trim()
  if (!t) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(t)
  u.lang = lang
  u.rate = 0.85
  u.pitch = 1
  window.speechSynthesis.speak(u)
}
