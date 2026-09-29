/**
 * Saved words: chunks a reader saves from the word-details sheet, stored per account in
 * `public.saved_words` (supabase/migrations/0027_saved_words.sql) and listed on the Words page.
 *
 * A small in-memory store (one list per learning language) sits in front of the table so the
 * details sheet's Save button and the Words page agree instantly; `useSavedWords` reads it via
 * useSyncExternalStore. Saving needs a real (non-anonymous) account -- callers check
 * `canSaveWords(user)` and offer sign-in otherwise.
 */
import type { User } from "@supabase/supabase-js"
import type { SavedWordRow } from "@/lib/db-types"
import { supabase } from "@/lib/supabase"
import type { LearningLanguage } from "@/lib/storage/language-learning-preferences"

export type SavedWord = SavedWordRow

/** What the details sheet knows about the word being looked at. */
export type SavedWordDraft = {
  word: string
  meaning?: string | null
  literal?: string | null
  sentence?: string | null
  sourceTitle?: string | null
}

const SELECT = "id, user_id, language, word, meaning, literal, sentence, source_title, created_at"
const MAX_SENTENCE_CHARS = 300

export function canSaveWords(user: User | null): user is User {
  return user != null && user.is_anonymous !== true
}

/** Same word, ignoring case and surrounding whitespace -- how "already saved?" is decided. */
export function savedWordKey(word: string): string {
  return word.trim().toLowerCase()
}

/**
 * The sentence in `text` that contains `word` (first match, case-insensitive), trimmed and capped,
 * so a saved word keeps the context it was read in. Falls back to the start of `text`.
 */
export function sentenceAround(text: string, word: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return ""
  // Match without the chunk's own closing punctuation ("Hola." -> "Hola"), so a chunk that ends
  // its sentence still ends the excerpt there instead of running on to the next one.
  const core = word.trim().replace(/[.!?…,;:"»”’)]+$/u, "") || word.trim()
  const at = flat.toLowerCase().indexOf(core.toLowerCase())
  if (at < 0) return clip(flat)
  const before = flat.slice(0, at)
  const startMatch = before.match(/.*[.!?…]["»”’)]*\s/s)
  const start = startMatch ? startMatch[0].length : 0
  const after = flat.slice(at + core.length)
  const endMatch = after.match(/[.!?…]["»”’)]*/)
  const end = endMatch ? at + core.length + (endMatch.index ?? 0) + endMatch[0].length : flat.length
  return clip(flat.slice(start, end).trim())
}

function clip(s: string): string {
  return s.length > MAX_SENTENCE_CHARS ? `${s.slice(0, MAX_SENTENCE_CHARS - 1).trimEnd()}…` : s
}

// ─── In-memory store ────────────────────────────────────────────────────────

type LanguageState = { words: SavedWord[]; loaded: boolean; loading: boolean; error: string | null }

const EMPTY: LanguageState = { words: [], loaded: false, loading: false, error: null }
const stateByLanguage = new Map<string, LanguageState>()
const listeners = new Set<() => void>()
let storeUserId: string | null = null

function emit() {
  for (const l of listeners) l()
}

function setState(language: string, patch: Partial<LanguageState>) {
  stateByLanguage.set(language, { ...(stateByLanguage.get(language) ?? EMPTY), ...patch })
  emit()
}

export function subscribeSavedWords(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSavedWordsState(language: string): LanguageState {
  return stateByLanguage.get(language) ?? EMPTY
}

/** Drop everything cached for the previous user (sign-out / account switch). */
function resetForUser(userId: string | null) {
  if (storeUserId === userId) return
  storeUserId = userId
  stateByLanguage.clear()
  emit()
}

export async function loadSavedWords(user: User | null, language: LearningLanguage): Promise<void> {
  resetForUser(canSaveWords(user) ? user.id : null)
  if (!canSaveWords(user)) return
  const current = getSavedWordsState(language)
  if (current.loading) return
  setState(language, { loading: true, error: null })
  const { data, error } = await supabase
    .from("saved_words")
    .select(SELECT)
    .eq("language", language)
    .order("created_at", { ascending: false })
  if (storeUserId !== user.id) return
  if (error) {
    setState(language, { loading: false, error: "Couldn't load your saved words." })
    return
  }
  setState(language, { words: (data ?? []) as SavedWord[], loaded: true, loading: false })
}

export async function saveWord(
  user: User,
  language: LearningLanguage,
  draft: SavedWordDraft,
): Promise<{ error: string | null }> {
  resetForUser(user.id)
  const word = draft.word.trim()
  if (!word) return { error: "Nothing to save." }
  const { data, error } = await supabase
    .from("saved_words")
    .upsert(
      {
        language,
        word,
        meaning: draft.meaning?.trim() || null,
        literal: draft.literal?.trim() || null,
        sentence: draft.sentence ? clip(draft.sentence.trim()) : null,
        source_title: draft.sourceTitle?.trim() || null,
      },
      { onConflict: "user_id,language,word" },
    )
    .select(SELECT)
    .single()
  if (error || !data) return { error: "Couldn't save this word. Try again." }
  const saved = data as SavedWord
  const words = getSavedWordsState(language).words.filter((w) => w.id !== saved.id)
  setState(language, { words: [saved, ...words] })
  return { error: null }
}

export async function removeSavedWord(id: string, language: LearningLanguage): Promise<{ error: string | null }> {
  const previous = getSavedWordsState(language).words
  setState(language, { words: previous.filter((w) => w.id !== id) })
  const { error } = await supabase.from("saved_words").delete().eq("id", id)
  if (error) {
    setState(language, { words: previous })
    return { error: "Couldn't remove this word. Try again." }
  }
  return { error: null }
}
