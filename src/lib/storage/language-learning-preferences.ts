/** Persisted in localStorage — General settings “I'm learning / native language”. */

export const LANGUAGE_LEARNING_PREFERENCES_KEY = "lector-language-learning-preferences"

/** Same-tab listeners (e.g. landing hero) refresh when prefs are saved. */
export const LANGUAGE_LEARNING_PREFS_UPDATED_EVENT = "lector-language-learning-prefs-updated"

export type LearningLanguage = "spanish" | "french" | "english"

export type NativeLanguage = "english" | "spanish" | "french"

export type LanguageLearningPreferences = {
  learning: LearningLanguage
  native: NativeLanguage
}

const DEFAULT: LanguageLearningPreferences = {
  learning: "spanish",
  native: "english",
}

const LEARNING_SET = new Set<LearningLanguage>(["spanish", "french", "english"])
const NATIVE_SET = new Set<NativeLanguage>(["english", "spanish", "french"])

function isLearningLanguage(v: unknown): v is LearningLanguage {
  return typeof v === "string" && LEARNING_SET.has(v as LearningLanguage)
}

function isNativeLanguage(v: unknown): v is NativeLanguage {
  return typeof v === "string" && NATIVE_SET.has(v as NativeLanguage)
}

/** Native choices allowed for a given target (learning) language. */
export function nativeOptionsForLearning(learning: LearningLanguage): NativeLanguage[] {
  if (learning === "english") return ["spanish", "french"]
  return ["english"]
}

export function clampNativeToLearning(
  learning: LearningLanguage,
  native: NativeLanguage,
): NativeLanguage {
  const allowed = nativeOptionsForLearning(learning)
  return allowed.includes(native) ? native : allowed[0]!
}

export function normalizeLanguageLearningPreferences(
  partial: Partial<LanguageLearningPreferences> | null | undefined,
): LanguageLearningPreferences {
  const learning = isLearningLanguage(partial?.learning) ? partial!.learning! : DEFAULT.learning
  const candidate = isNativeLanguage(partial?.native) ? partial!.native! : DEFAULT.native
  const native = clampNativeToLearning(learning, candidate)
  return { learning, native }
}

/** Whether this browser has an explicit choice saved (vs. silently falling back to the default). */
export function hasStoredLanguageLearningPreferences(): boolean {
  if (typeof window === "undefined") return false
  try {
    return Boolean(localStorage.getItem(LANGUAGE_LEARNING_PREFERENCES_KEY)?.trim())
  } catch {
    return false
  }
}

/**
 * The visitor's own language, read from the browser/phone settings: the first of Spanish, French
 * or English in their language list. Anything else (or no browser) counts as English.
 */
export function browserNativeLanguage(languages?: readonly string[]): NativeLanguage {
  let list: readonly string[] = languages ?? []
  if (!languages && typeof navigator !== "undefined") {
    list = navigator.languages?.length ? navigator.languages : [navigator.language]
  }
  for (const tag of list) {
    const base = tag?.toLowerCase().split("-")[0]
    if (base === "es") return "spanish"
    if (base === "fr") return "french"
    if (base === "en") return "english"
  }
  return "english"
}

/**
 * Before the reader has chosen anything: a Spanish- or French-language browser most likely
 * belongs to someone learning English, so start them there with explanations in their language.
 * Everyone else starts on Spanish, as before.
 */
export function defaultLanguageLearningPreferences(
  languages?: readonly string[],
): LanguageLearningPreferences {
  const native = browserNativeLanguage(languages)
  if (native === "english") return { ...DEFAULT }
  return { learning: "english", native }
}

export function getStoredLanguageLearningPreferences(): LanguageLearningPreferences {
  if (typeof window === "undefined") return { ...DEFAULT }
  try {
    const raw = localStorage.getItem(LANGUAGE_LEARNING_PREFERENCES_KEY)
    if (!raw?.trim()) return defaultLanguageLearningPreferences()
    const parsed = JSON.parse(raw) as unknown
    if (parsed == null || typeof parsed !== "object") return defaultLanguageLearningPreferences()
    return normalizeLanguageLearningPreferences(parsed as Partial<LanguageLearningPreferences>)
  } catch {
    return { ...DEFAULT }
  }
}

export function setStoredLanguageLearningPreferences(
  next: LanguageLearningPreferences,
): LanguageLearningPreferences {
  const normalized = normalizeLanguageLearningPreferences(next)
  try {
    localStorage.setItem(LANGUAGE_LEARNING_PREFERENCES_KEY, JSON.stringify(normalized))
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(LANGUAGE_LEARNING_PREFS_UPDATED_EVENT))
    } catch {
      /* ignore */
    }
  }
  return normalized
}

/** Short greeting on the landing hero for the chosen “I’m learning” language. */
export function landingGreetingWord(learning: LearningLanguage): string {
  if (learning === "french") return "Bonjour"
  if (learning === "english") return "Hello"
  return "Hola"
}

export const LEARNING_LANGUAGE_LABEL: Record<LearningLanguage, string> = {
  spanish: "Spanish",
  french: "French",
  english: "English",
}

export const NATIVE_LANGUAGE_LABEL: Record<NativeLanguage, string> = {
  english: "English",
  spanish: "Spanish",
  french: "French",
}

/** Regional flag emoji for language options (decorative; paired with visible text). */
export const LANGUAGE_OPTION_FLAG_EMOJI: Record<LearningLanguage, string> = {
  spanish: "🇪🇸",
  french: "🇫🇷",
  english: "🇬🇧",
}

export function languageOptionFlagEmoji(id: LearningLanguage | NativeLanguage): string {
  return LANGUAGE_OPTION_FLAG_EMOJI[id]
}

/** Page eyebrows written in the language being learned (e.g. above "Discover"). */
export const DISCOVER_EYEBROW: Record<LearningLanguage, string> = {
  spanish: "Descubre",
  french: "Découvre",
  english: "Discover",
}

export const LIBRARY_EYEBROW: Record<LearningLanguage, string> = {
  spanish: "Tu biblioteca",
  french: "Ta bibliothèque",
  english: "Your library",
}

export const WORDS_EYEBROW: Record<LearningLanguage, string> = {
  spanish: "Tus palabras",
  french: "Tes mots",
  english: "Your words",
}
