/** Persisted in localStorage — General settings “I'm learning / native language”. */

export const LANGUAGE_LEARNING_PREFERENCES_KEY = "lector-language-learning-preferences"

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

export function getStoredLanguageLearningPreferences(): LanguageLearningPreferences {
  if (typeof window === "undefined") return { ...DEFAULT }
  try {
    const raw = localStorage.getItem(LANGUAGE_LEARNING_PREFERENCES_KEY)
    if (!raw?.trim()) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as unknown
    if (parsed == null || typeof parsed !== "object") return { ...DEFAULT }
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
  return normalized
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
