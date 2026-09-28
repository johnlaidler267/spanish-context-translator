import { useEffect, useState } from "react"
import {
  getStoredLanguageLearningPreferences,
  LANGUAGE_LEARNING_PREFERENCES_KEY,
  LANGUAGE_LEARNING_PREFS_UPDATED_EVENT,
  type LanguageLearningPreferences,
} from "@/lib/storage/language-learning-preferences"

/** Stored "I'm learning / native language" pair, kept live across Settings saves and other tabs. */
export function useLanguageLearningPreferences(): LanguageLearningPreferences {
  const [prefs, setPrefs] = useState<LanguageLearningPreferences>(() =>
    getStoredLanguageLearningPreferences(),
  )

  useEffect(() => {
    const sync = () => setPrefs(getStoredLanguageLearningPreferences())
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANGUAGE_LEARNING_PREFERENCES_KEY) sync()
    }
    window.addEventListener(LANGUAGE_LEARNING_PREFS_UPDATED_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(LANGUAGE_LEARNING_PREFS_UPDATED_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return prefs
}
