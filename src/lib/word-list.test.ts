import { describe, expect, it } from "vitest"
import { NEW_REVIEW_STATE, type ReviewState } from "@/lib/practice"
import type { SavedWord } from "@/lib/saved-words"
import { countByStatus, filterWords, withStatus, wordStatus } from "@/lib/word-list"

const now = new Date("2026-10-02T12:00:00Z")
const review = (patch: Partial<ReviewState>): ReviewState => ({
  ...NEW_REVIEW_STATE,
  ...patch,
})

function saved(id: string, word: string, extra: Partial<SavedWord> = {}): SavedWord {
  return {
    id,
    user_id: "u",
    language: "spanish",
    word,
    meaning: null,
    literal: null,
    sentence: null,
    source_title: null,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  }
}

describe("wordStatus", () => {
  it("is new until practiced, due once its review date passes", () => {
    expect(wordStatus(NEW_REVIEW_STATE, now)).toBe("new")
    expect(wordStatus(review({ due_at: "2026-10-01T00:00:00Z", review_stage: 5 }), now)).toBe("due")
  })

  it("is learned once it's on a 16+ day interval, learning before that", () => {
    expect(wordStatus(review({ due_at: "2026-10-05T00:00:00Z", review_stage: 3 }), now)).toBe("learning")
    expect(wordStatus(review({ due_at: "2026-10-20T00:00:00Z", review_stage: 4 }), now)).toBe("learned")
  })
})

describe("filterWords", () => {
  const reviews = new Map([
    ["a", review({ due_at: "2026-10-01T00:00:00Z", lapse_count: 1 })],
    [
      "b",
      review({
        due_at: "2026-12-01T00:00:00Z",
        review_stage: 6,
        lapse_count: 4,
      }),
    ],
  ])
  const words = withStatus(
    [
      saved("a", "quedarse con", {
        meaning: "keep",
        created_at: "2026-03-01T00:00:00Z",
      }),
      saved("b", "adiós", {
        source_title: "Maniac",
        created_at: "2026-01-01T00:00:00Z",
      }),
      saved("c", "por lo que", {
        sentence: "su impacto había sido gigantesco",
        created_at: "2026-02-01T00:00:00Z",
      }),
    ],
    reviews,
    now,
  )
  const ids = (list: { id: string }[]) => list.map((w) => w.id)
  const opts = { query: "", status: "all" as const, sort: "newest" as const }

  it("sorts newest first, A–Z, or most missed first", () => {
    expect(ids(filterWords(words, opts))).toEqual(["a", "c", "b"])
    expect(ids(filterWords(words, { ...opts, sort: "alpha" }))).toEqual(["b", "c", "a"])
    expect(ids(filterWords(words, { ...opts, sort: "missed" }))).toEqual(["b", "a", "c"])
  })

  it("searches word, meaning, sentence and book, ignoring accents and case", () => {
    expect(ids(filterWords(words, { ...opts, query: "ADIOS" }))).toEqual(["b"])
    expect(ids(filterWords(words, { ...opts, query: "keep" }))).toEqual(["a"])
    expect(ids(filterWords(words, { ...opts, query: "gigantesco" }))).toEqual(["c"])
    expect(ids(filterWords(words, { ...opts, query: "maniac" }))).toEqual(["b"])
  })

  it("filters by status and counts each status", () => {
    expect(ids(filterWords(words, { ...opts, status: "due" }))).toEqual(["a"])
    expect(countByStatus(words)).toEqual({
      new: 1,
      due: 1,
      learning: 0,
      learned: 1,
    })
  })
})
