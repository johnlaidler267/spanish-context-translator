/**
 * Keeps the "I'm learning / native language" choice on the signed-in account, so it follows the
 * reader across devices. localStorage stays the one place the app reads it from (see
 * language-learning-preferences.ts); this only copies it to and from Supabase Auth
 * `user_metadata`, the same place the display name lives.
 */
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import {
  getStoredLanguageLearningPreferences,
  hasStoredLanguageLearningPreferences,
  normalizeLanguageLearningPreferences,
  setStoredLanguageLearningPreferences,
  type LanguageLearningPreferences,
} from "@/lib/storage/language-learning-preferences"

export const LEARNING_LANGUAGE_META_KEY = "learning_language"
export const NATIVE_LANGUAGE_META_KEY = "native_language"

const copiedUpForUserIds = new Set<string>()

function isRealAccount(user: User | null): user is User {
  return user != null && user.is_anonymous !== true
}

/** The account's saved choice, or null when it has never saved one. */
export function languagePrefsFromAccount(user: User | null): LanguageLearningPreferences | null {
  if (!isRealAccount(user)) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const learning = meta[LEARNING_LANGUAGE_META_KEY]
  if (typeof learning !== "string") return null
  const native = meta[NATIVE_LANGUAGE_META_KEY]
  return normalizeLanguageLearningPreferences({
    learning: learning as LanguageLearningPreferences["learning"],
    native: typeof native === "string" ? (native as LanguageLearningPreferences["native"]) : undefined,
  })
}

async function saveToAccount(prefs: LanguageLearningPreferences): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { [LEARNING_LANGUAGE_META_KEY]: prefs.learning, [NATIVE_LANGUAGE_META_KEY]: prefs.native },
  })
  if (error) console.warn("[language-prefs] account save failed:", error.message)
}

/** Save a choice the reader just made: this browser right away, their account in the background. */
export function chooseLanguageLearningPreferences(
  next: LanguageLearningPreferences,
  user: User | null,
): LanguageLearningPreferences {
  const saved = setStoredLanguageLearningPreferences(next)
  if (isRealAccount(user)) void saveToAccount(saved)
  return saved
}

/**
 * On sign-in (or a session restore): the account's choice wins and is applied to this browser.
 * If the account has none yet but this browser does, the browser's choice is copied up, so a
 * reader who picked a language before signing up keeps it everywhere.
 */
export function syncLanguageLearningPreferencesWithAccount(user: User | null): void {
  if (!isRealAccount(user)) return
  const fromAccount = languagePrefsFromAccount(user)
  if (fromAccount) {
    const local = getStoredLanguageLearningPreferences()
    const differs = local.learning !== fromAccount.learning || local.native !== fromAccount.native
    if (differs || !hasStoredLanguageLearningPreferences()) setStoredLanguageLearningPreferences(fromAccount)
    return
  }
  // At most once per user per page load: the save refreshes the signed-in user, and a failed or
  // slow save must not turn every later refresh into another write.
  if (hasStoredLanguageLearningPreferences() && !copiedUpForUserIds.has(user.id)) {
    copiedUpForUserIds.add(user.id)
    void saveToAccount(getStoredLanguageLearningPreferences())
  }
}
