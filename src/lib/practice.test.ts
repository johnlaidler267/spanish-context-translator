import { describe, expect, it } from "vitest"
import {
  checkAnswer,
  makeCloze,
  NEW_REVIEW_STATE,
  pickRound,
  scheduleReview,
  type PracticeWord,
  type ReviewState,
} from "@/lib/practice"

const NOW = new Date("2026-06-01T12:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString()

function word(id: string, review: Partial<ReviewState> = {}, created = "2026-01-01T00:00:00.000Z"): PracticeWord {
  return {
    id,
    user_id: "u",
    language: "spanish",
    word: id,
    meaning: null,
    literal: null,
    sentence: null,
    source_title: null,
    created_at: created,
    review: { ...NEW_REVIEW_STATE, ...review },
  }
}

describe("scheduleReview", () => {
  it("moves a word up a stage and spaces the next review further out each time", () => {
    let s = scheduleReview(NEW_REVIEW_STATE, "correct", NOW)
    expect(s).toMatchObject({ review_stage: 1, due_at: daysFromNow(1), review_count: 1 })
    s = scheduleReview(s, "correct", new Date(s.due_at!))
    expect(s.review_stage).toBe(2)
    expect(Date.parse(s.due_at!) - Date.parse(s.last_reviewed_at!)).toBe(3 * DAY)
  })

  it("drops a missed word to the bottom so it comes back soon, counting a lapse only once learned", () => {
    const learned = { ...NEW_REVIEW_STATE, review_stage: 4, due_at: daysFromNow(-1) }
    const s = scheduleReview(learned, "missed", NOW)
    expect(s.review_stage).toBe(0)
    expect(s.lapse_count).toBe(1)
    expect(Date.parse(s.due_at!) - NOW.getTime()).toBeLessThan(DAY)
    expect(scheduleReview(NEW_REVIEW_STATE, "missed", NOW).lapse_count).toBe(0)
  })

  it("doesn't advance a word answered with a hint", () => {
    const s = scheduleReview({ ...NEW_REVIEW_STATE, review_stage: 3, due_at: daysFromNow(0) }, "hinted", NOW)
    expect(s.review_stage).toBe(3)
  })

  it("doesn't fast-track a word practiced before it's due", () => {
    const early = { ...NEW_REVIEW_STATE, review_stage: 2, due_at: daysFromNow(2) }
    const s = scheduleReview(early, "correct", NOW)
    expect(s).toMatchObject({ review_stage: 2, due_at: early.due_at, review_count: 1 })
  })
})

describe("pickRound", () => {
  const noShuffle = () => 0.999999

  it("takes due words first (most overdue first), then new words, then ones due soonest", () => {
    const words = [
      word("later", { due_at: daysFromNow(5) }),
      word("soon", { due_at: daysFromNow(1) }),
      word("new-old", {}, "2026-01-01T00:00:00.000Z"),
      word("new-recent", {}, "2026-05-01T00:00:00.000Z"),
      word("overdue", { due_at: daysFromNow(-3) }),
      word("due", { due_at: daysFromNow(-1) }),
    ]
    const ids = (size: number) => pickRound(words, NOW, size, noShuffle).map((w) => w.id).sort()
    expect(ids(2)).toEqual(["due", "overdue"])
    expect(ids(3)).toEqual(["due", "new-old", "overdue"])
    expect(ids(5)).toEqual(["due", "new-old", "new-recent", "overdue", "soon"])
  })

  it("caps a round at ten words", () => {
    const words = Array.from({ length: 25 }, (_, i) => word(`w${i}`))
    expect(pickRound(words, NOW)).toHaveLength(10)
  })
})

describe("makeCloze", () => {
  it("blanks the word, keeping its casing from the sentence", () => {
    expect(makeCloze("Hola, amigo. ¿Qué tal?", "¿qué")).toEqual({ before: "Hola, amigo. ¿", answer: "Qué", after: " tal?" })
  })

  it("matches whole words only", () => {
    expect(makeCloze("Ellos hablan con la gente.", "la")).toEqual({
      before: "Ellos hablan con ",
      answer: "la",
      after: " gente.",
    })
  })

  it("handles phrases and saved punctuation, and returns null when the word isn't there", () => {
    expect(makeCloze("De repente, se detuvo.", "De repente,")?.answer).toBe("De repente")
    expect(makeCloze("Hola.", "Adiós.")).toBeNull()
    expect(makeCloze(null, "hola")).toBeNull()
  })
})

describe("checkAnswer", () => {
  it("ignores case, punctuation and extra spaces", () => {
    expect(checkAnswer("  HOLA! ", ["Hola"])).toBe("exact")
    expect(checkAnswer("de  repente", ["De repente"])).toBe("exact")
  })

  it("accepts a missing accent or one typo in a longer word, but not a different word", () => {
    expect(checkAnswer("adios", ["adiós"])).toBe("accent")
    expect(checkAnswer("manana", ["mañana"])).toBe("accent")
    expect(checkAnswer("detubo", ["detuvo"])).toBe("typo")
    expect(checkAnswer("sol", ["son"])).toBe("wrong")
    expect(checkAnswer("", ["hola"])).toBe("wrong")
  })
})
