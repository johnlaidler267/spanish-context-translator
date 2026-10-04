/**
 * Building a conjugation round: which tenses, verbs and question kinds to ask.
 *
 * Rounds lean toward the reader's weaker tenses (among the ones they picked) rather than
 * replacing their choice: each tense's weight grows with its miss rate.
 */
import {
  conjugate,
  DRILL_PERSONS,
  stripAccents,
  TENSE_IDS,
  TENSES,
  type Person,
  type TenseId,
  type TenseInfo,
} from "@/lib/learn/conjugation"
import { DRILL_VERBS, SENTENCE_BANK, type DrillSentence } from "@/lib/learn/drill-content"

export const ROUND_SIZE = 10

export type VerbSet = "common" | "irregular"
export type QuestionMode = "mixed" | "bare" | "sentences"

export type DrillSettings = { tenses: TenseId[]; verbs: VerbSet; mode: QuestionMode }

export type TenseStat = { right: number; total: number }
export type TenseStats = Partial<Record<TenseId, TenseStat>>

export type DrillItem =
  | { kind: "bare"; verb: string; tense: TenseId; person: Person }
  | ({ kind: "sentence" } & DrillSentence)

type Rng = () => number

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]

/** Below this many answers a tense's accuracy is too noisy to act on. */
const MIN_ANSWERS = 3

/** How strongly a tense is favored: a floor so strong tenses still come up, plus its miss rate. */
export function tenseWeight(stat: TenseStat | undefined): number {
  if (!stat || stat.total < MIN_ANSWERS) return 1
  return 0.35 + (1 - stat.right / stat.total)
}

/** The picked tense with the lowest accuracy, once there's enough history to say. */
export function weakestTense(
  tenses: readonly TenseId[],
  stats: TenseStats,
): { tense: TenseInfo; accuracy: number } | null {
  let best: { tense: TenseInfo; accuracy: number } | null = null
  for (const t of TENSES) {
    if (!tenses.includes(t.id)) continue
    const s = stats[t.id]
    if (!s || s.total < MIN_ANSWERS) continue
    const accuracy = s.right / s.total
    if (!best || accuracy < best.accuracy) best = { tense: t, accuracy }
  }
  return best
}

function pickTense(tenses: readonly TenseId[], stats: TenseStats, rng: Rng): TenseId {
  const weights = tenses.map((t) => tenseWeight(stats[t]))
  let r = rng() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < tenses.length; i++) {
    r -= weights[i]
    if (r <= 0) return tenses[i]
  }
  return tenses[tenses.length - 1]
}

export function buildRound(settings: DrillSettings, stats: TenseStats, rng: Rng = Math.random): DrillItem[] {
  const tenses = settings.tenses.length > 0 ? settings.tenses : [...TENSE_IDS]
  const verbs = DRILL_VERBS.filter((v) => settings.verbs === "common" || v.irregular).map((v) => v.verb)
  const items: DrillItem[] = []
  const used = new Set<string>()
  for (let guard = 0; items.length < ROUND_SIZE && guard < 500; guard++) {
    const tense = pickTense(tenses, stats, rng)
    const wantSentence = settings.mode === "sentences" || (settings.mode === "mixed" && rng() < 0.5)
    if (wantSentence) {
      const options = SENTENCE_BANK.filter((s) => s.tense === tense && !used.has(s.text))
      if (options.length > 0) {
        const s = pick(options, rng)
        used.add(s.text)
        items.push({ kind: "sentence", ...s })
        continue
      }
      // Ran out of sentences for this tense; fall through to a bare form.
    }
    const verb = pick(verbs, rng)
    const person = pick(DRILL_PERSONS, rng)
    const key = `${verb}|${tense}|${person}`
    if (used.has(key)) continue
    used.add(key)
    items.push({ kind: "bare", verb, tense, person })
  }
  return items
}

/** A round of just the items missed last time, each asked at least once (repeats fill it to double). */
export function buildMissesRound(missed: DrillItem[], rng: Rng = Math.random): DrillItem[] {
  const items = [...missed]
  const target = Math.min(ROUND_SIZE, missed.length * 2)
  while (items.length < target) items.push(pick(missed, rng))
  return shuffle(items, rng)
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export type WarmUp = { sentence: DrillSentence; answer: string; options: string[] }

/** One sentence with three choices: the right form and the same verb/person in two other tenses. */
export function buildWarmUp(rng: Rng = Math.random): WarmUp {
  const sentence = pick(SENTENCE_BANK, rng)
  const answer = conjugate(sentence.verb, sentence.tense, sentence.person)
  const seen = new Set([stripAccents(answer)])
  const options = [answer]
  for (const t of shuffle([...TENSE_IDS], rng)) {
    if (options.length >= 3) break
    const form = conjugate(sentence.verb, t, sentence.person)
    if (seen.has(stripAccents(form))) continue
    seen.add(stripAccents(form))
    options.push(form)
  }
  return { sentence, answer, options: shuffle(options, rng) }
}
