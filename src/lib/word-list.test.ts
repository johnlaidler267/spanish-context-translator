import { describe, expect, it } from "vitest"
import { NEW_REVIEW_STATE, type ReviewState } from "@/lib/practice"
import type { SavedWord } from "@/lib/saved-words"
import { countByStatus, filterWords, groupBySource, practiceSummary, savedThisWeek, withStatus, wordStatus } from "@/lib/word-list"

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

describe("groupBySource", () => {
  const words = [
    saved("1", "por lo que", { source_title: "Maniac", created_at: "2026-09-30T00:00:00Z" }),
    saved("2", "a raíz de", { source_title: "El País", created_at: "2026-09-20T00:00:00Z" }),
    saved("3", "adiós", { created_at: "2026-10-01T00:00:00Z" }),
    saved("4", "el telar", { source_title: "Maniac ", created_at: "2026-09-01T00:00:00Z" }),
    saved("5", "vislumbrar", { source_title: "  ", created_at: "2026-08-01T00:00:00Z" }),
  ]

  it("puts the most recently saved-to source first and keeps the given order inside each group", () => {
    const groups = groupBySource(words)
    expect(groups.map((g) => g.source)).toEqual(["Maniac", "El País", null])
    expect(groups[0].words.map((w) => w.id)).toEqual(["1", "4"])
  })

  it("collects words with no (or a blank) source last, even when they're the newest", () => {
    expect(groupBySource(words).at(-1)!.words.map((w) => w.id)).toEqual(["3", "5"])
  })
})

describe("practiceSummary", () => {
  it("says when a word hasn't been practiced", () => {
    expect(practiceSummary(NEW_REVIEW_STATE, now)).toBe("Not practiced yet")
  })

  it("counts practice, says when it's next due, and how often it was missed", () => {
    expect(
      practiceSummary(review({ review_count: 3, lapse_count: 1, due_at: "2026-10-06T12:00:00Z", review_stage: 2 }), now),
    ).toBe("Practiced 3 times · next review in 4 days · missed once")
    expect(practiceSummary(review({ review_count: 1, due_at: "2026-10-03T08:00:00Z", review_stage: 1 }), now)).toBe(
      "Practiced once · next review tomorrow",
    )
    expect(
      practiceSummary(review({ review_count: 5, lapse_count: 2, due_at: "2026-10-01T00:00:00Z", review_stage: 3 }), now),
    ).toBe("Practiced 5 times · due for review now · missed 2 times")
  })
})

describe("savedThisWeek", () => {
  it("counts words saved in the last 7 days only", () => {
    const at = (daysAgo: number) => ({ created_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() })
    expect(savedThisWeek([at(0), at(1), at(6.9), at(7), at(30)], now)).toBe(3)
    expect(savedThisWeek([], now)).toBe(0)
  })
})
