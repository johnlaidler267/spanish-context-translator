/** Web Speech API — browser TTS for hover exploration (no API key). */
export const HOVER_TTS_LANG = "es-MX"

let voicesListenerAttached = false
let cachedVoices: SpeechSynthesisVoice[] = []

function refreshSpeechVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  cachedVoices = window.speechSynthesis.getVoices()
}

function attachVoicesChangedOnce(): void {
  if (voicesListenerAttached || typeof window === "undefined" || !window.speechSynthesis) return
  voicesListenerAttached = true
  const s = window.speechSynthesis
  s.addEventListener("voiceschanged", refreshSpeechVoices)
  refreshSpeechVoices()
}

/** iPhone / iPad Safari (and iPadOS desktop UA). */
export function isLikelyIOSWebKit(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  if (/iP(ad|hone|od)/i.test(ua)) return true
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

function normalizeLang(l: string): string {
  return l.replace(/_/g, "-").toLowerCase()
}

/** Mobile Safari often needs an explicit installed voice; `lang` alone can be silent. */
function pickSpanishVoice(): SpeechSynthesisVoice | undefined {
  refreshSpeechVoices()
  const v = cachedVoices
  if (v.length === 0) return undefined
  const pick = (prefix: string) =>
    v.find((voice) => normalizeLang(voice.lang).startsWith(prefix))
  return pick("es-mx") ?? pick("es-es") ?? pick("es") ?? v.find((voice) => /^es\b/i.test(voice.lang))
}

export function cancelHoverSpeech(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

/**
 * Call from a click/tap handler before enabling hover TTS.
 * iOS Safari: must `speak()` at least once (even `""`) during that gesture so later
 * synthesis is allowed (see https://stackoverflow.com/q/61658740).
 */
export function primeSpeechSynthesisFromUserGesture(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  attachVoicesChangedOnce()
  const s = window.speechSynthesis
  s.cancel()
  s.resume()
  refreshSpeechVoices()
  s.speak(new SpeechSynthesisUtterance(""))
}

/**
 * Call synchronously at the start of `touchstart` on the reading surface (iOS only).
 * WebKit ties speech to user gestures; an empty utterance in this touch fixes touchmove speaks.
 */
export function speechUnlockForTouchGesture(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  if (!isLikelyIOSWebKit()) return
  attachVoicesChangedOnce()
  const s = window.speechSynthesis
  s.resume()
  refreshSpeechVoices()
  s.speak(new SpeechSynthesisUtterance(""))
}

export function speakHoverChunk(text: string, lang: string = HOVER_TTS_LANG): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const t = text.trim()
  if (!t) return
  attachVoicesChangedOnce()
  refreshSpeechVoices()

  const s = window.speechSynthesis
  s.cancel()
  const u = new SpeechSynthesisUtterance(t)
  const voice = pickSpanishVoice()
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  } else {
    u.lang = lang
  }
  u.rate = 0.85
  u.pitch = 1
  s.speak(u)
}
