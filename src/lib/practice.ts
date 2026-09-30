/**
 * Practice for saved words: fill-in-the-blank rounds scheduled with spaced repetition.
 *
 * Scheduling is a Leitner-style ladder: each saved word sits on a stage, and getting it right
 * (first try, no hint) moves it up a stage, so the gap before it comes back grows
 * (1 day, 3 days, a week, ...). Missing it drops it back to the bottom so it returns soon.
 * Spacing reviews out just as a word is about to be forgotten is what makes it stick.
 *
 * Review state is stored on the saved_words row (supabase/migrations/0028_saved_words_practice.sql).
 * If those columns aren't there yet, practice still works; progress just isn't saved.
 */
import type { SavedWordReviewRow } from "@/lib/db-types"
import type { SavedWord } from "@/lib/saved-words"
import { supabase } from "@/lib/supabase"

export const ROUND_SIZE = 10

/** Days until the next review once a word reaches each stage (index = stage). */
export const STAGE_INTERVAL_DAYS = [0, 1, 3, 7, 16, 35, 75, 160] as const
const MAX_STAGE = STAGE_INTERVAL_DAYS.length - 1
/** A missed word comes back after this long (i.e. next session, not the very next round). */
const RELEARN_DELAY_MS = 10 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type ReviewState = Omit<SavedWordReviewRow, "id">

export const NEW_REVIEW_STATE: ReviewState = {
  review_stage: 0,
  due_at: null,
  last_reviewed_at: null,
  review_count: 0,
  lapse_count: 0,
}

/** How a card went: right on the first try, right after a hint, or missed / revealed. */
export type Outcome = "correct" | "hinted" | "missed"

/** The next review state after answering a card with `outcome` at `now`. */
export function scheduleReview(state: ReviewState, outcome: Outcome, now: Date): ReviewState {
  const reviewed = { review_count: state.review_count + 1, last_reviewed_at: now.toISOString() }
  if (outcome === "missed") {
    return {
      ...state,
      ...reviewed,
      review_stage: 0,
      lapse_count: state.lapse_count + (state.due_at ? 1 : 0),
      due_at: new Date(now.getTime() + RELEARN_DELAY_MS).toISOString(),
    }
  }
  // Practicing a word before it's due (extra rounds) shouldn't fast-track it up the ladder:
  // keep its stage and due date, just record the review.
  if (state.due_at && Date.parse(state.due_at) > now.getTime()) {
    return { ...state, ...reviewed }
  }
  const stage = outcome === "correct" ? Math.min(state.review_stage + 1, MAX_STAGE) : Math.max(state.review_stage, 1)
  return {
    ...state,
    ...reviewed,
    review_stage: stage,
    due_at: new Date(now.getTime() + STAGE_INTERVAL_DAYS[stage] * DAY_MS).toISOString(),
  }
}

export type PracticeWord = SavedWord & { review: ReviewState }

export function isDue(word: PracticeWord, now: Date): boolean {
  return word.review.due_at == null || Date.parse(word.review.due_at) <= now.getTime()
}

/**
 * Up to `size` words for the next round: words due for review first (most overdue first), then
 * never-practiced words (oldest saved first, so none get left behind), then -- so there's always
 * something to practice -- the words coming due soonest. The round is shuffled so similar words
 * don't always appear in the same order.
 */
export function pickRound(
  words: PracticeWord[],
  now: Date,
  size = ROUND_SIZE,
  random: () => number = Math.random,
): PracticeWord[] {
  const time = (iso: string | null) => (iso ? Date.parse(iso) : 0)
  const due = words
    .filter((w) => w.review.due_at != null && isDue(w, now))
    .sort((a, b) => time(a.review.due_at) - time(b.review.due_at))
  const fresh = words.filter((w) => w.review.due_at == null).sort((a, b) => time(a.created_at) - time(b.created_at))
  const ahead = words
    .filter((w) => !isDue(w, now))
    .sort((a, b) => time(a.review.due_at) - time(b.review.due_at))
  return shuffle([...due, ...fresh, ...ahead].slice(0, size), random)
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ─── The blank ──────────────────────────────────────────────────────────────

const EDGE_PUNCT = /^[\s¿¡"«“‘'(]+|[\s.!?…,;:"»”’')]+$/gu

/** The saved chunk without the punctuation it was saved with ("¿Qué?" -> "Qué"). */
export function answerText(word: string): string {
  return word.replace(EDGE_PUNCT, "") || word.trim()
}

export type Cloze = { before: string; answer: string; after: string } | null

/**
 * Split the saved sentence around the word so it can be blanked out. Matches whole words only
 * (so "la" doesn't blank the middle of "hablan"), case-insensitively; `answer` keeps the casing
 * used in the sentence. Null when the sentence doesn't contain the word.
 */
export function makeCloze(sentence: string | null, word: string): Cloze {
  if (!sentence) return null
  const target = answerText(word)
  if (!target) return null
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
  const match = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").exec(sentence)
  if (!match) return null
  return {
    before: sentence.slice(0, match.index),
    answer: match[0],
    after: sentence.slice(match.index + match[0].length),
  }
}

// ─── Checking an answer ─────────────────────────────────────────────────────

/** "exact" and "accent"/"typo" count as right; the last two get a spelling note. */
export type AnswerMatch = "exact" | "accent" | "typo" | "wrong"

function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¿¡.,!?…;:"«»“”‘’()]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC")
}

/** Edit distance, capped: returns early once it's clearly more than `max`. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

/**
 * Compare what the reader typed with the expected answers (the form in the sentence and the
 * saved word). Case and punctuation never matter; a missing/wrong accent or a single typo in a
 * longer word still counts, with a note, so a near-miss isn't marked as not knowing the word.
 */
export function checkAnswer(typed: string, expected: string[]): AnswerMatch {
  const guess = normalize(typed)
  if (!guess) return "wrong"
  const targets = expected.map(normalize).filter(Boolean)
  if (targets.includes(guess)) return "exact"
  const bare = stripAccents(guess)
  if (targets.some((t) => stripAccents(t) === bare)) return "accent"
  if (targets.some((t) => stripAccents(t).length >= 6 && withinEdits(bare, stripAccents(t), 1))) return "typo"
  return "wrong"
}

// ─── Persistence ────────────────────────────────────────────────────────────

const REVIEW_SELECT = "id, review_stage, due_at, last_reviewed_at, review_count, lapse_count"

/**
 * Review state for the given language's saved words, by word id. `saves: false` means the
 * review columns aren't available (migration 0028 not applied), so progress won't be kept.
 */
export async function loadReviewStates(
  language: string,
): Promise<{ states: Map<string, ReviewState>; saves: boolean }> {
  const { data, error } = await supabase.from("saved_words").select(REVIEW_SELECT).eq("language", language)
  if (error || !data) return { states: new Map(), saves: false }
  const rows = data as unknown as SavedWordReviewRow[]
  return { states: new Map(rows.map(({ id, ...review }) => [id, { ...NEW_REVIEW_STATE, ...review }])), saves: true }
}

export async function saveReviewState(id: string, review: ReviewState): Promise<boolean> {
  const { error } = await supabase.from("saved_words").update(review).eq("id", id)
  return !error
}
