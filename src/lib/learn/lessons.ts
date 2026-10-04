/**
 * Mini lessons: one grammar idea, a couple of teaching screens, then practice.
 *
 * Written as data so a new lesson is just text. Inline markup in any text field:
 * `**word**` highlights a form (the thing being taught), `_phrase_` sets Spanish in italics.
 * Typed steps name verb + tense + person; the expected form comes from conjugation.ts.
 */
import type { Person, TenseId } from "@/lib/learn/conjugation"

export type TeachBlock =
  | { type: "text"; text: string }
  | { type: "pattern"; parts: { text: string; key?: boolean }[] }
  | { type: "example"; label?: string; es: string; en: string }
  | { type: "note"; text: string }

export type LessonStep =
  | { kind: "teach"; title: string; blocks: TeachBlock[] }
  | { kind: "choice"; text: string; options: { text: string; right?: boolean; why: string }[] }
  | { kind: "type"; prompt: string; text: string; verb: string; tense: TenseId; person: Person }

export type Lesson = {
  id: string
  title: string
  /** One Spanish line that shows what the lesson is about. */
  sample: string
  minutes: number
  steps: LessonStep[]
  finish: { title: string; recap: string[]; drill?: { tense: TenseId; label: string } }
}

const SI_CLAUSES: Lesson = {
  id: "si-clauses",
  title: "If I had…",
  sample: "Si tuviera tiempo, viajaría.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Talking about what isn't true",
      blocks: [
        { type: "text", text: "To imagine a situation that isn't real right now, Spanish uses two parts." },
        {
          type: "pattern",
          parts: [{ text: "si" }, { text: "imperfect subjunctive", key: true }, { text: "conditional", key: true }],
        },
        { type: "example", es: "Si **tuviera** más tiempo, **leería** más.", en: "If I had more time, I'd read more." },
        {
          type: "example",
          es: "Si **viviéramos** en Madrid, **iríamos** al Prado cada semana.",
          en: "If we lived in Madrid, we'd go to the Prado every week.",
        },
        { type: "note", text: "The order can flip: _Leería más si tuviera tiempo._" },
      ],
    },
    {
      kind: "teach",
      title: "Possible or imagined?",
      blocks: [
        { type: "text", text: "If the situation could really happen, keep it simple: present after _si_, then future or present." },
        { type: "example", label: "Possible", es: "Si **tengo** tiempo, **leeré**.", en: "If I have time, I'll read. (I might.)" },
        { type: "example", label: "Imagined", es: "Si **tuviera** tiempo, **leería**.", en: "If I had time, I'd read. (I don't.)" },
        { type: "note", text: "One rule that never bends: the conditional never comes right after _si_." },
      ],
    },
    {
      kind: "choice",
      text: "Si yo ___ rico, viajaría por todo el mundo.",
      options: [
        { text: "fuera", right: true, why: "An imagined situation, so imperfect subjunctive after si." },
        { text: "era", why: "Era is the imperfect indicative: it describes the past, not something imagined." },
        { text: "sería", why: "The conditional belongs in the other half (viajaría). It never comes right after si." },
      ],
    },
    {
      kind: "choice",
      text: "Si mañana hace sol, ___ a la playa.",
      options: [
        { text: "iremos", right: true, why: "Hace (present) means a real possibility, so the result is plain future." },
        { text: "iríamos", why: "The conditional is for imagined situations. Hace sol is a real possibility, so use the future." },
        { text: "fuéramos", why: "The subjunctive goes after si, and only for something imagined. Here the result needs the future." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "Si nosotros ___ cerca del mar, nadaríamos cada día.", verb: "vivir", tense: "impsubj", person: 3 },
    { kind: "type", prompt: "Your turn", text: "Si ella ___, te ayudaría.", verb: "poder", tense: "impsubj", person: 2 },
    { kind: "type", prompt: "Now the other half", text: "Si tuviera hambre, ___ algo.", verb: "comer", tense: "conditional", person: 0 },
  ],
  finish: {
    title: "You can talk about what isn't true",
    recap: [
      "Imagined: _si_ + imperfect subjunctive, then conditional.",
      "Possible: _si_ + present, then future or present.",
      "Never put the conditional right after _si_.",
    ],
    drill: { tense: "impsubj", label: "Drill the imperfect subjunctive" },
  },
}

export const LESSONS: Lesson[] = [SI_CLAUSES]

/** Shown in the list as coming soon, so the shape of the series is visible. */
export const UPCOMING_LESSONS: { title: string; sample: string }[] = [
  { title: "Ser or estar", sample: "Es aburrido / está aburrido." },
  { title: "Preterite or imperfect", sample: "Llovía cuando salí." },
  { title: "Por or para", sample: "Gracias por todo. Es para ti." },
  { title: "Wishes and hopes", sample: "Ojalá que llueva." },
]

export function findLesson(id: string | undefined): Lesson | undefined {
  return LESSONS.find((l) => l.id === id)
}

export type InlineSegment = { text: string; style?: "highlight" | "spanish" }

/** Splits `**highlight**` and `_spanish_` markup into segments. */
export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = []
  const re = /\*\*(.+?)\*\*|_(.+?)_/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push(m[1] != null ? { text: m[1], style: "highlight" } : { text: m[2], style: "spanish" })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
