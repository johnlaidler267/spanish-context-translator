/**
 * Learn page settings and per-tense accuracy, kept in localStorage.
 *
 * Browser-only for now (no account sync): it's practice history, not something a reader
 * would lose sleep over, and it keeps the first version free of new database tables.
 */
import { TENSE_IDS, type TenseId } from "@/lib/learn/conjugation"
import type { DrillSettings, QuestionMode, TenseStats, VerbSet } from "@/lib/learn/drill-round"

export const LEARN_SETTINGS_KEY = "lexalens-learn-drill-settings"
export const LEARN_STATS_KEY = "lexalens-learn-tense-stats"

export const DEFAULT_DRILL_SETTINGS: DrillSettings = {
  tenses: ["present", "preterite", "imperfect"],
  verbs: "common",
  mode: "mixed",
}

const VERB_SETS: VerbSet[] = ["common", "irregular"]
const MODES: QuestionMode[] = ["mixed", "bare", "sentences"]

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode): practice still works, it just isn't remembered.
  }
}

const isTenseId = (v: unknown): v is TenseId => typeof v === "string" && (TENSE_IDS as readonly string[]).includes(v)

export function loadDrillSettings(): DrillSettings {
  const raw = readJson(LEARN_SETTINGS_KEY) as Partial<DrillSettings> | null
  if (!raw || typeof raw !== "object") return DEFAULT_DRILL_SETTINGS
  const tenses = Array.isArray(raw.tenses) ? raw.tenses.filter(isTenseId) : []
  return {
    tenses: tenses.length > 0 ? tenses : DEFAULT_DRILL_SETTINGS.tenses,
    verbs: VERB_SETS.includes(raw.verbs as VerbSet) ? (raw.verbs as VerbSet) : DEFAULT_DRILL_SETTINGS.verbs,
    mode: MODES.includes(raw.mode as QuestionMode) ? (raw.mode as QuestionMode) : DEFAULT_DRILL_SETTINGS.mode,
  }
}

export function saveDrillSettings(settings: DrillSettings) {
  writeJson(LEARN_SETTINGS_KEY, settings)
}

export function loadTenseStats(): TenseStats {
  const raw = readJson(LEARN_STATS_KEY)
  if (!raw || typeof raw !== "object") return {}
  const stats: TenseStats = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const s = v as { right?: unknown; total?: unknown }
    if (isTenseId(k) && typeof s?.right === "number" && typeof s?.total === "number" && s.total > 0) {
      stats[k] = { right: Math.min(s.right, s.total), total: s.total }
    }
  }
  return stats
}

/** Adds one answer to a tense's tally and saves it. Returns the updated stats. */
export function recordTenseAnswer(stats: TenseStats, tense: TenseId, right: boolean): TenseStats {
  const prev = stats[tense] ?? { right: 0, total: 0 }
  const next = { ...stats, [tense]: { right: prev.right + (right ? 1 : 0), total: prev.total + 1 } }
  writeJson(LEARN_STATS_KEY, next)
  return next
}

export const LEARN_LESSONS_DONE_KEY = "lexalens-learn-lessons-done"

/** Ids of the mini lessons the reader has finished. */
export function loadCompletedLessons(): string[] {
  const raw = readJson(LEARN_LESSONS_DONE_KEY)
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []
}

export function markLessonCompleted(id: string) {
  const done = loadCompletedLessons()
  if (!done.includes(id)) writeJson(LEARN_LESSONS_DONE_KEY, [...done, id])
}
