/** Web Speech API — browser TTS for hover exploration (no API key). */
export const HOVER_TTS_LANG = "es-MX"

export function cancelHoverSpeech(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

export function speakHoverChunk(text: string, lang: string = HOVER_TTS_LANG): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const t = text.trim()
  if (!t) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(t)
  u.lang = lang
  u.rate = 0.85;   // slightly slower — clearer for language learning
u.pitch = 0.8;   // leave pitch alone, changes make it worse
  window.speechSynthesis.speak(u)
}
