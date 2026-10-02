/**
 * Words page list logic: each saved word's practice status (from its spaced-repetition state in
 * src/lib/practice.ts), plus the search / status filter / sort the page offers and its summary counts.
 */
import { NEW_REVIEW_STATE, type ReviewState } from "@/lib/practice"
import type { SavedWord } from "@/lib/saved-words"

/** New: never practiced. Due: up for review now. Learned: due again in 16+ days. Learning: the rest. */
export type WordStatus = "new" | "due" | "learning" | "learned"

/** Stage whose interval is 16 days (STAGE_INTERVAL_DAYS[4]) -- far enough out to call a word learned. */
const LEARNED_STAGE = 4

export const STATUS_LABEL: Record<WordStatus, string> = {
  new: "New",
  due: "Due",
  learning: "Learning",
  learned: "Learned",
}

export function wordStatus(review: ReviewState, now: Date): WordStatus {
  if (review.due_at == null) return "new"
  if (Date.parse(review.due_at) <= now.getTime()) return "due"
  return review.review_stage >= LEARNED_STAGE ? "learned" : "learning"
}

export type ListedWord = SavedWord & {
  status: WordStatus
  review: ReviewState
}

export function withStatus(words: SavedWord[], reviews: Map<string, ReviewState>, now: Date): ListedWord[] {
  return words.map((w) => {
    const review = reviews.get(w.id) ?? NEW_REVIEW_STATE
    return { ...w, review, status: wordStatus(review, now) }
  })
}

export type StatusFilter = "all" | WordStatus
export type WordSort = "source" | "newest" | "alpha" | "missed"

/** "source" lists newest first, grouped under each book/article by `groupBySource`. */
export const SORT_LABEL: Record<WordSort, string> = {
  source: "By source",
  newest: "Recent",
  alpha: "A–Z",
  missed: "Most missed",
}

/** Lowercase without accents, so "adios" finds "adiós". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/** Words matching the search (word, meaning, sentence or book) and status, in the chosen order. */
export function filterWords(
  words: ListedWord[],
  { query, status, sort }: { query: string; status: StatusFilter; sort: WordSort },
): ListedWord[] {
  const q = fold(query.trim())
  const out = words.filter(
    (w) =>
      (status === "all" || w.status === status) &&
      (!q || [w.word, w.meaning, w.sentence, w.source_title].some((f) => f != null && fold(f).includes(q))),
  )
  if (sort === "alpha") return out.sort((a, b) => a.word.localeCompare(b.word, "es", { sensitivity: "base" }))
  if (sort === "missed") return out.sort((a, b) => b.review.lapse_count - a.review.lapse_count)
  return out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export function countByStatus(words: ListedWord[]): Record<WordStatus, number> {
  const counts: Record<WordStatus, number> = {
    new: 0,
    due: 0,
    learning: 0,
    learned: 0,
  }
  for (const w of words) counts[w.status]++
  return counts
}

export type WordGroup<W extends SavedWord> = {
  /** The saved `source_title`, or null for words saved without one (shown as "Other"). */
  source: string | null
  words: W[]
}

/**
 * Words split by the book/article they were saved from, keeping their order inside each group.
 * The source saved to most recently comes first; words with no source go last.
 */
export function groupBySource<W extends SavedWord>(words: W[]): WordGroup<W>[] {
  const groups = new Map<string | null, W[]>()
  for (const w of words) {
    const source = w.source_title?.trim() || null
    const list = groups.get(source)
    if (list) list.push(w)
    else groups.set(source, [w])
  }
  const latest = (list: W[]) => Math.max(...list.map((w) => Date.parse(w.created_at) || 0))
  return [...groups]
    .map(([source, list]) => ({ source, words: list }))
    .sort((a, b) => (a.source == null ? 1 : b.source == null ? -1 : latest(b.words) - latest(a.words)))
}

/** One line on a word's practice so far, e.g. "Practiced 3 times · next review in 4 days · missed once". */
export function practiceSummary(review: ReviewState, now: Date): string {
  if (review.review_count === 0 || review.due_at == null) return "Not practiced yet"
  const times = review.review_count === 1 ? "once" : `${review.review_count} times`
  const days = Math.ceil((Date.parse(review.due_at) - now.getTime()) / 86_400_000)
  const next = days <= 0 ? "due for review now" : days === 1 ? "next review tomorrow" : `next review in ${days} days`
  const missed =
    review.lapse_count === 0 ? "" : ` · missed ${review.lapse_count === 1 ? "once" : `${review.lapse_count} times`}`
  return `Practiced ${times} · ${next}${missed}`
}
