/** Web Speech API — browser TTS for hover exploration (no API key). */
import {
  getStoredLanguageLearningPreferences,
  type LearningLanguage,
} from "@/lib/storage/language-learning-preferences"

/** Fallback BCP-47 tag when no matching installed voice is found. */
export const HOVER_TTS_LANG: Record<LearningLanguage, string> = {
  spanish: "es-MX",
  french: "fr-FR",
  english: "en-US",
}

/** Preferred voice-locale prefixes, most preferred first; the bare prefix catches any region. */
const VOICE_LANG_PREFIXES: Record<LearningLanguage, string[]> = {
  spanish: ["es-mx", "es-es", "es"],
  french: ["fr-fr", "fr-ca", "fr"],
  english: ["en-us", "en-gb", "en"],
}

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

/**
 * Spanish conjunction "y" (and) is written capital "Y" at sentence start; WebKit + es voices
 * often read that as the letter name ("i griega") instead of /i/. Lowercasing isolated Y fixes it.
 */
function normalizeSpanishYConjunctionForTts(text: string): string {
  return text.replace(/\bY\b/g, "y")
}

/** Mobile Safari often needs an explicit installed voice; `lang` alone can be silent. */
export function pickVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  learning: LearningLanguage,
): SpeechSynthesisVoice | undefined {
  for (const prefix of VOICE_LANG_PREFIXES[learning]) {
    const match = voices.find((voice) => {
      const l = normalizeLang(voice.lang)
      return l === prefix || l.startsWith(`${prefix}-`)
    })
    if (match) return match
  }
  return undefined
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

export function speakHoverChunk(
  text: string,
  learning: LearningLanguage = getStoredLanguageLearningPreferences().learning,
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  const trimmed = text.trim()
  const t = learning === "spanish" ? normalizeSpanishYConjunctionForTts(trimmed) : trimmed
  if (!t) return
  attachVoicesChangedOnce()
  refreshSpeechVoices()

  const s = window.speechSynthesis
  s.cancel()
  const u = new SpeechSynthesisUtterance(t)
  const voice = pickVoiceForLanguage(cachedVoices, learning)
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  } else {
    u.lang = HOVER_TTS_LANG[learning]
  }
  u.rate = 0.85
  u.pitch = 1
  s.speak(u)
}
