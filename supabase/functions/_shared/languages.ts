/**
 * Learner language pair sent by the app (see src/lib/storage/language-learning-preferences.ts).
 * Older clients omit it, so everything defaults to Spanish learner / English native.
 */

export type Language = "spanish" | "french" | "english"

export const LANGUAGE_NAME: Record<Language, string> = {
  spanish: "Spanish",
  french: "French",
  english: "English",
}

function isLanguage(v: unknown): v is Language {
  return v === "spanish" || v === "french" || v === "english"
}

export function parseLanguagePair(
  learningRaw: unknown,
  nativeRaw: unknown,
): { learning: Language; native: Language } {
  const learning: Language = isLanguage(learningRaw) ? learningRaw : "spanish"
  let native: Language = isLanguage(nativeRaw) ? nativeRaw : "english"
  if (native === learning) native = learning === "english" ? "spanish" : "english"
  return { learning, native }
}
