/**
 * Spanish conjugation for the Learn page: the answer key and the grader.
 *
 * Forms come from @jirimracek/conjugate-esp (rule-based, MIT), never from the model, so an
 * answer key can't be wrong. The library's full data is ~500 KB, so instead of shipping it the
 * drill verbs' forms are pre-generated into verb-forms.json (verb-forms.test.ts builds that file
 * from the library and fails if it drifts; `npx vitest run -u` regenerates it). Sentence-bank
 * items only say which verb, tense and person they want; the form is always looked up here.
 */
import VERB_FORMS from "@/lib/learn/verb-forms.json"

export const TENSE_IDS = [
  "present",
  "preterite",
  "imperfect",
  "perfect",
  "future",
  "conditional",
  "subj",
  "impsubj",
  "imperative",
] as const
export type TenseId = (typeof TENSE_IDS)[number]

export type TenseInfo = { id: TenseId; name: string; example: string }

/**
 * In teaching order. `example` is hablar in the yo form (tú for the imperative, which has no yo),
 * shown under each tense in the picker.
 */
export const TENSES: TenseInfo[] = [
  { id: "present", name: "Present", example: "hablo" },
  { id: "preterite", name: "Preterite", example: "hablé" },
  { id: "imperfect", name: "Imperfect", example: "hablaba" },
  { id: "perfect", name: "Present perfect", example: "he hablado" },
  { id: "future", name: "Future", example: "hablaré" },
  { id: "conditional", name: "Conditional", example: "hablaría" },
  { id: "subj", name: "Present subjunctive", example: "hable" },
  { id: "impsubj", name: "Imperfect subjunctive", example: "hablara" },
  { id: "imperative", name: "Imperative", example: "¡habla!" },
]

export const TENSE_NAME = Object.fromEntries(TENSES.map((t) => [t.id, t.name])) as Record<TenseId, string>

/** Index into a conjugation row: yo, tú, él, nosotros, vosotros, ellos. */
export type Person = 0 | 1 | 2 | 3 | 4 | 5

export const PERSON_LABEL: Record<Person, string> = {
  0: "yo",
  1: "tú",
  2: "él / ella / usted",
  3: "nosotros",
  4: "vosotros",
  5: "ellos / ellas / ustedes",
}

export const PERSON_SHORT: Record<Person, string> = {
  0: "yo",
  1: "tú",
  2: "él",
  3: "nosotros",
  4: "vosotros",
  5: "ellos",
}

/** Vosotros is left out of drills for now; most learners don't use it. */
export const DRILL_PERSONS: Person[] = [0, 1, 2, 3, 5]

/**
 * Affirmative commands: tú, usted, nosotros, ustedes. There's no yo command, and slot 2/5 means
 * usted/ustedes only (you don't command él or ellos), so the imperative has its own labels.
 */
export const IMPERATIVE_PERSONS: Person[] = [1, 2, 3, 5]

const IMPERATIVE_LABEL: Partial<Record<Person, string>> = { 2: "usted", 5: "ustedes" }

/** Which persons a tense is drilled in. */
export function drillPersons(tense: TenseId): Person[] {
  return tense === "imperative" ? IMPERATIVE_PERSONS : DRILL_PERSONS
}

/** "él / ella / usted", or just "usted" in the imperative. */
export function personLabel(tense: TenseId, person: Person): string {
  return (tense === "imperative" && IMPERATIVE_LABEL[person]) || PERSON_LABEL[person]
}

/** "él", or "usted" in the imperative. */
export function personShort(tense: TenseId, person: Person): string {
  return (tense === "imperative" && IMPERATIVE_LABEL[person]) || PERSON_SHORT[person]
}

/**
 * Each drill verb's forms: tense -> [yo, tú, él, nosotros, vosotros, ellos]. The imperative's yo
 * slot is "" (no such form) and its él/ellos slots hold the usted/ustedes commands.
 */
export type VerbForms = Record<TenseId, string[]>

const TABLE = VERB_FORMS as Record<string, VerbForms>

/** Every drilled tense of `verb`, or null if it isn't one of the pre-generated drill verbs. */
export function verbForms(verb: string): VerbForms | null {
  return Object.hasOwn(TABLE, verb) ? TABLE[verb] : null
}

export function conjugate(verb: string, tense: TenseId, person: Person): string {
  const forms = verbForms(verb)
  if (!forms) throw new Error(`Unknown verb: ${verb}`)
  return forms[tense][person]
}

const SUBJECT_PRONOUN = /^(yo|tú|tu|él|el|ella|usted|nosotros|nosotras|vosotros|vosotras|ellos|ellas|ustedes) /

/** Lowercase, trimmed, punctuation dropped; a leading subject pronoun ("nosotros tuvimos") is allowed. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[¿?¡!.,;:"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SUBJECT_PRONOUN, "")
}

/** Accents dropped, for telling a missing accent apart from a wrong form. */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/** Forms people actually say that the library's answer key doesn't: "¡vamos!" over "vayamos". */
const ALSO_ACCEPTED: Record<string, string> = { "ir|imperative|3": "vamos" }

export type Grade =
  | { kind: "correct"; answer: string }
  | { kind: "accent"; answer: string }
  | { kind: "wrong-tense"; answer: string; tense: TenseId }
  | { kind: "wrong-person"; answer: string; person: Person }
  | { kind: "wrong"; answer: string }

export function isRight(grade: Grade): boolean {
  return grade.kind === "correct" || grade.kind === "accent"
}

/**
 * Grades a typed answer. Beyond right/wrong, it names the common slips: a missing accent
 * (counted as right), the right verb in another tense, or the right tense for another person.
 */
export function gradeConjugation(verb: string, tense: TenseId, person: Person, typed: string): Grade {
  const forms = verbForms(verb)
  if (!forms) throw new Error(`Unknown verb: ${verb}`)
  const answer = forms[tense][person]
  const got = normalizeAnswer(typed)
  if (!got) return { kind: "wrong", answer }
  if (got === answer || ALSO_ACCEPTED[`${verb}|${tense}|${person}`] === got) return { kind: "correct", answer }
  const bare = stripAccents(got)
  if (bare === stripAccents(answer)) return { kind: "accent", answer }
  for (const t of TENSE_IDS) {
    // Skipped as a guess: its forms mostly copy the present (habla) or subjunctive (hable), and
    // "that's the él form" or "that's the subjunctive" is the likelier slip.
    if (t === "imperative") continue
    if (t !== tense && stripAccents(forms[t][person]) === bare) return { kind: "wrong-tense", answer, tense: t }
  }
  for (let p = 0; p < 6; p++) {
    if (p !== person && forms[tense][p] && stripAccents(forms[tense][p]) === bare) {
      return { kind: "wrong-person", answer, person: p as Person }
    }
  }
  return { kind: "wrong", answer }
}

/** "present, preterite and imperfect" */
export function listTenses(ids: readonly TenseId[]): string {
  const names = TENSES.filter((t) => ids.includes(t.id)).map((t) => t.name.toLowerCase())
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}
