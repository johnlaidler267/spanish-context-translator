import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { conjugate } from "@/lib/learn/conjugation"
import { DRILL_VERBS } from "@/lib/learn/drill-content"
import {
  buildMissesRound,
  buildRound,
  buildWarmUp,
  ROUND_SIZE,
  tenseWeight,
  weakestTense,
  type DrillItem,
} from "@/lib/learn/drill-round"
import {
  DEFAULT_DRILL_SETTINGS,
  LEARN_SETTINGS_KEY,
  loadCompletedLessons,
  loadDrillSettings,
  loadTenseStats,
  markLessonCompleted,
  recordTenseAnswer,
} from "@/lib/learn/progress-storage"

/** Deterministic stand-in for Math.random. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe("buildRound", () => {
  it("makes a full round from only the picked tenses, with no repeats", () => {
    const round = buildRound({ tenses: ["preterite", "subj"], verbs: "common", mode: "mixed" }, {}, seeded(1))
    expect(round).toHaveLength(ROUND_SIZE)
    expect(round.every((i) => i.tense === "preterite" || i.tense === "subj")).toBe(true)
    const keys = round.map((i) => (i.kind === "sentence" ? i.text : `${i.verb}|${i.tense}|${i.person}`))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("respects the question mode and verb set", () => {
    const bare = buildRound({ tenses: ["present"], verbs: "irregular", mode: "bare" }, {}, seeded(2))
    const irregular = new Set(DRILL_VERBS.filter((v) => v.irregular).map((v) => v.verb))
    expect(bare.every((i) => i.kind === "bare" && irregular.has(i.verb))).toBe(true)

    // Only 3 present-tense sentences exist, so the rest of a sentences-only round falls back to bare forms.
    const sentences = buildRound({ tenses: ["present"], verbs: "common", mode: "sentences" }, {}, seeded(3))
    expect(sentences.filter((i) => i.kind === "sentence")).toHaveLength(3)
    expect(sentences).toHaveLength(ROUND_SIZE)
  })

  it("never drills vosotros", () => {
    const round = buildRound({ ...DEFAULT_DRILL_SETTINGS, mode: "bare" }, {}, seeded(4))
    expect(round.some((i) => i.person === 4)).toBe(false)
  })

  it("leans toward the weakest picked tense without dropping the others", () => {
    const stats = { present: { right: 9, total: 10 }, preterite: { right: 8, total: 10 }, imperfect: { right: 5, total: 10 } }
    const counts: Record<string, number> = {}
    const rng = seeded(5)
    for (let r = 0; r < 200; r++) {
      for (const item of buildRound({ ...DEFAULT_DRILL_SETTINGS, mode: "bare" }, stats, rng)) {
        counts[item.tense] = (counts[item.tense] ?? 0) + 1
      }
    }
    expect(counts.imperfect).toBeGreaterThan(counts.preterite)
    expect(counts.preterite).toBeGreaterThan(counts.present)
    expect(counts.present).toBeGreaterThan(0)
  })
})

describe("tense weighting", () => {
  it("treats a tense with little history as neutral", () => {
    expect(tenseWeight(undefined)).toBe(1)
    expect(tenseWeight({ right: 0, total: 2 })).toBe(1)
    expect(tenseWeight({ right: 5, total: 10 })).toBeCloseTo(0.85)
  })

  it("weakestTense only considers picked tenses with enough answers", () => {
    const stats = { present: { right: 2, total: 10 }, preterite: { right: 6, total: 10 }, imperfect: { right: 0, total: 1 } }
    expect(weakestTense(["preterite", "imperfect"], stats)?.tense.id).toBe("preterite")
    expect(weakestTense(["imperfect"], stats)).toBeNull()
  })
})

describe("buildMissesRound / buildWarmUp", () => {
  it("asks every missed item at least once", () => {
    const missed: DrillItem[] = [
      { kind: "bare", verb: "tener", tense: "preterite", person: 0 },
      { kind: "bare", verb: "ir", tense: "future", person: 1 },
    ]
    const round = buildMissesRound(missed, seeded(6))
    expect(round).toHaveLength(4)
    for (const m of missed) expect(round).toContainEqual(m)
  })

  it("offers three distinct choices including the right form", () => {
    for (let seed = 1; seed < 40; seed++) {
      const w = buildWarmUp(seeded(seed))
      expect(w.answer).toBe(conjugate(w.sentence.verb, w.sentence.tense, w.sentence.person))
      expect(w.options).toContain(w.answer)
      expect(new Set(w.options).size).toBe(3)
    }
  })
})

// Tests run in the `node` environment, so localStorage is stubbed (same as reading-progress-storage.test.ts).
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
}

describe("progress storage", () => {
  beforeEach(() => vi.stubGlobal("localStorage", makeMemoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it("falls back to defaults for missing or malformed settings", () => {
    expect(loadDrillSettings()).toEqual(DEFAULT_DRILL_SETTINGS)
    localStorage.setItem(LEARN_SETTINGS_KEY, JSON.stringify({ tenses: ["nope"], verbs: "all", mode: 3 }))
    expect(loadDrillSettings()).toEqual(DEFAULT_DRILL_SETTINGS)
    localStorage.setItem(LEARN_SETTINGS_KEY, "{not json")
    expect(loadDrillSettings()).toEqual(DEFAULT_DRILL_SETTINGS)
  })

  it("records answers and reads them back", () => {
    let stats = recordTenseAnswer({}, "future", true)
    stats = recordTenseAnswer(stats, "future", false)
    expect(stats.future).toEqual({ right: 1, total: 2 })
    expect(loadTenseStats()).toEqual({ future: { right: 1, total: 2 } })
  })

  it("remembers finished lessons once each", () => {
    expect(loadCompletedLessons()).toEqual([])
    markLessonCompleted("por-para")
    markLessonCompleted("por-para")
    markLessonCompleted("ojala")
    expect(loadCompletedLessons()).toEqual(["por-para", "ojala"])
  })
})
