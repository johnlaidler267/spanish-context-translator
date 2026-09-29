import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useLanguageLearningPreferences } from "@/hooks/use-language-learning-preferences"
import {
  canSaveWords,
  getSavedWordsState,
  loadSavedWords,
  removeSavedWord,
  savedWordKey,
  saveWord,
  subscribeSavedWords,
  type SavedWordDraft,
} from "@/lib/saved-words"

/** The reader's saved words for their current learning language, loaded on first use. */
export function useSavedWords() {
  const { user } = useAuth()
  const { learning } = useLanguageLearningPreferences()
  const state = useSyncExternalStore(subscribeSavedWords, () => getSavedWordsState(learning))

  useEffect(() => {
    void loadSavedWords(user, learning)
  }, [user, learning])

  const isSaved = useCallback(
    (word: string) => state.words.some((w) => savedWordKey(w.word) === savedWordKey(word)),
    [state.words],
  )
  const findSaved = useCallback(
    (word: string) => state.words.find((w) => savedWordKey(w.word) === savedWordKey(word)) ?? null,
    [state.words],
  )
  const save = useCallback(
    (draft: SavedWordDraft) =>
      canSaveWords(user) ? saveWord(user, learning, draft) : Promise.resolve({ error: "Sign in to save words." }),
    [user, learning],
  )
  const remove = useCallback((id: string) => removeSavedWord(id, learning), [learning])

  return {
    ...state,
    language: learning,
    canSave: canSaveWords(user),
    isSaved,
    findSaved,
    save,
    remove,
  }
}
