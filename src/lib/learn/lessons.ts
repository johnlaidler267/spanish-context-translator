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

export const LESSON_LEVELS = ["beginner", "intermediate", "advanced"] as const
export type LessonLevel = (typeof LESSON_LEVELS)[number]

export const LESSON_LEVEL_NAME: Record<LessonLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

export type Lesson = {
  id: string
  title: string
  level: LessonLevel
  /** One Spanish line that shows what the lesson is about. */
  sample: string
  minutes: number
  steps: LessonStep[]
  /** `drill` hands off to a one-off conjugation round of these tenses. */
  finish: { title: string; recap: string[]; drill?: { tenses: TenseId[]; label: string } }
}

const SI_CLAUSES: Lesson = {
  id: "si-clauses",
  level: "advanced",
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
    drill: { tenses: ["impsubj"], label: "Drill the imperfect subjunctive" },
  },
}

const SER_ESTAR: Lesson = {
  id: "ser-estar",
  level: "beginner",
  title: "Ser or estar",
  sample: "Es aburrido / está aburrido.",
  minutes: 5,
  steps: [
    {
      kind: "teach",
      title: "Two verbs for “to be”",
      blocks: [
        {
          type: "text",
          text: "Spanish splits “to be” in two. **Ser** says what something is: identity, origin, job, time, what it's made of. **Estar** says where it is or how it is right now.",
        },
        { type: "example", label: "Ser", es: "Mi madre **es** médica.", en: "My mother is a doctor." },
        { type: "example", label: "Estar", es: "Mi madre **está** cansada.", en: "My mother is tired." },
        { type: "note", text: "A quick test: is it what the thing is, or how it's doing?" },
      ],
    },
    {
      kind: "teach",
      title: "Same word, different meaning",
      blocks: [
        { type: "text", text: "Some adjectives change meaning depending on which verb they follow." },
        { type: "example", es: "La película **es** aburrida.", en: "The film is boring." },
        { type: "example", es: "**Estoy** aburrido.", en: "I'm bored." },
        { type: "example", es: "Juan **es** listo. / Juan **está** listo.", en: "Juan is clever. / Juan is ready." },
        {
          type: "note",
          text: "Two exceptions to memorize: where an event takes place uses ser (_La fiesta es en mi casa_), and _muerto_ takes estar (_El pez está muerto_).",
        },
      ],
    },
    {
      kind: "choice",
      text: "Madrid ___ en España.",
      options: [
        { text: "está", right: true, why: "Where a place is: estar." },
        { text: "es", why: "Ser says what something is. For where something is, use estar." },
      ],
    },
    {
      kind: "choice",
      text: "La fiesta ___ en mi casa el sábado.",
      options: [
        { text: "es", right: true, why: "Where an event takes place uses ser. It's the classic exception." },
        { text: "está", why: "Estar is for where things and people are. Events are the exception: they take ser." },
      ],
    },
    {
      kind: "choice",
      text: "No puedo salir hoy, ___ enferma.",
      options: [
        { text: "estoy", right: true, why: "Being sick is a condition, so estar." },
        { text: "soy", why: "Ser would make being sick part of who you are. A condition takes estar." },
      ],
    },
    {
      kind: "choice",
      text: "Mi hermano ___ muy listo: siempre saca buenas notas.",
      options: [
        { text: "es", right: true, why: "Ser + listo means clever, which fits the good grades." },
        { text: "está", why: "Estar + listo means ready. Good grades point to clever, which takes ser." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "Mis padres ___ de Colombia.", verb: "ser", tense: "present", person: 5 },
    { kind: "type", prompt: "Your turn", text: "¿Dónde ___ las llaves?", verb: "estar", tense: "present", person: 5 },
  ],
  finish: {
    title: "You can choose between ser and estar",
    recap: [
      "_Ser_: identity, origin, job, time, and where events happen.",
      "_Estar_: location and how things are right now.",
      "Some adjectives change meaning: _es listo_ (clever), _está listo_ (ready).",
    ],
    drill: { tenses: ["present"], label: "Drill the present tense" },
  },
}

const PRETERITE_IMPERFECT: Lesson = {
  id: "preterite-imperfect",
  level: "intermediate",
  title: "Preterite or imperfect",
  sample: "Llovía cuando salí.",
  minutes: 5,
  steps: [
    {
      kind: "teach",
      title: "Two pasts, two jobs",
      blocks: [
        {
          type: "text",
          text: "Spanish has two simple past tenses. The **preterite** tells what happened: finished events. The **imperfect** sets the scene: what was going on, what used to happen, what things were like.",
        },
        { type: "example", label: "Preterite", es: "Ayer **comí** paella.", en: "Yesterday I ate paella." },
        {
          type: "example",
          label: "Imperfect",
          es: "De niño **comía** paella los domingos.",
          en: "As a kid I used to eat paella on Sundays.",
        },
        { type: "note", text: "Think of a film: the imperfect is the background, the preterite is the action." },
      ],
    },
    {
      kind: "teach",
      title: "Together in one sentence",
      blocks: [
        { type: "text", text: "They often meet: the imperfect sets up what was going on, and the preterite interrupts it." },
        { type: "example", es: "**Llovía** cuando **salí** de casa.", en: "It was raining when I left the house." },
        { type: "example", es: "Mientras **leía**, **sonó** el teléfono.", en: "While I was reading, the phone rang." },
        {
          type: "note",
          text: "Clue words help: _ayer, anoche, de repente_ point to the preterite; _siempre, de niño, mientras_ to the imperfect.",
        },
      ],
    },
    {
      kind: "choice",
      text: "Cuando era pequeña, ___ en un pueblo.",
      options: [
        { text: "vivía", right: true, why: "How things used to be is background, so imperfect." },
        { text: "viví", why: "The preterite makes it one finished event. Cuando era pequeña describes a stretch of time." },
      ],
    },
    {
      kind: "choice",
      text: "Anoche ___ una película muy buena.",
      options: [
        { text: "vi", right: true, why: "Anoche marks one finished event: preterite." },
        { text: "veía", why: "The imperfect describes something ongoing or habitual, not one film last night." },
      ],
    },
    {
      kind: "choice",
      text: "Mientras yo ___, mi hermano cocinaba.",
      options: [
        { text: "trabajaba", right: true, why: "Two actions in progress side by side: both imperfect." },
        { text: "trabajé", why: "The preterite would make your work a finished event. Mientras sets up something in progress." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "De repente, alguien ___ a la puerta.", verb: "llamar", tense: "preterite", person: 2 },
    { kind: "type", prompt: "Your turn", text: "Todos los veranos mis abuelos nos ___ a la playa.", verb: "llevar", tense: "imperfect", person: 5 },
    { kind: "type", prompt: "Your turn", text: "Ayer ___ tarde al trabajo.", verb: "llegar", tense: "preterite", person: 0 },
  ],
  finish: {
    title: "You can tell the two pasts apart",
    recap: [
      "Preterite: finished events, often with a clear time (_ayer, anoche_).",
      "Imperfect: background, habits and descriptions (_siempre, de niño, mientras_).",
      "Together: the imperfect sets the scene, the preterite interrupts it.",
    ],
    drill: { tenses: ["preterite", "imperfect"], label: "Drill both pasts" },
  },
}

const POR_PARA: Lesson = {
  id: "por-para",
  level: "beginner",
  title: "Por or para",
  sample: "Gracias por todo. Es para ti.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Two ways to say “for”",
      blocks: [
        {
          type: "text",
          text: "**Para** points ahead: a goal, a recipient, a destination, a deadline. **Por** explains why or how: a cause, an exchange, a route, a means.",
        },
        { type: "example", label: "Para", es: "Este regalo es **para** ti.", en: "This gift is for you." },
        { type: "example", label: "Para", es: "Estudio **para** aprender.", en: "I study (in order) to learn." },
        { type: "example", label: "Por", es: "Gracias **por** todo.", en: "Thanks for everything." },
        { type: "example", label: "Por", es: "Caminamos **por** el parque.", en: "We walked through the park." },
      ],
    },
    {
      kind: "teach",
      title: "A few more of each",
      blocks: [
        { type: "example", label: "Exchange", es: "Pagué diez euros **por** el libro.", en: "I paid ten euros for the book." },
        { type: "example", label: "Means", es: "Te llamo **por** teléfono.", en: "I'll call you on the phone." },
        { type: "example", label: "Deadline", es: "El informe es **para** el lunes.", en: "The report is due Monday." },
        { type: "example", label: "Destination", es: "Mañana salgo **para** Lima.", en: "Tomorrow I leave for Lima." },
        { type: "note", text: "Quick check: is it pointing ahead (_para_) or explaining why or how (_por_)?" },
      ],
    },
    {
      kind: "choice",
      text: "Salimos ___ Madrid mañana por la mañana.",
      options: [
        { text: "para", right: true, why: "A destination: para." },
        { text: "por", why: "Por Madrid would mean through or around Madrid, not heading there." },
      ],
    },
    {
      kind: "choice",
      text: "Muchas gracias ___ tu ayuda.",
      options: [
        { text: "por", right: true, why: "Thanks look back at the cause: por." },
        { text: "para", why: "Para points to a goal or recipient. What you're thankful for is a cause, so por." },
      ],
    },
    {
      kind: "choice",
      text: "Necesito el informe ___ el viernes.",
      options: [
        { text: "para", right: true, why: "A deadline: para." },
        { text: "por", why: "Por with a time gives a rough period, not a deadline. “By Friday” is para." },
      ],
    },
    {
      kind: "choice",
      text: "Cambié mi bicicleta ___ una guitarra.",
      options: [
        { text: "por", right: true, why: "A swap or exchange: por." },
        { text: "para", why: "Para would mean the bike was meant for a guitar. An exchange takes por." },
      ],
    },
  ],
  finish: {
    title: "You can choose between por and para",
    recap: [
      "_Para_: goals, recipients, destinations, deadlines.",
      "_Por_: causes and thanks, exchanges, routes, means.",
      "Pointing ahead is _para_; explaining why or how is _por_.",
    ],
  },
}

const OJALA: Lesson = {
  id: "ojala",
  level: "intermediate",
  title: "Wishes and hopes",
  sample: "Ojalá que llueva.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Ojalá: I hope, if only",
      blocks: [
        {
          type: "text",
          text: "_Ojalá_ means “I hope” or “if only.” It comes from Arabic (“God willing”), it never changes form, and the verb after it is always subjunctive.",
        },
        { type: "example", es: "Ojalá **llueva** mañana.", en: "I hope it rains tomorrow." },
        { type: "example", es: "Ojalá que **puedas** venir.", en: "I hope you can come." },
        { type: "note", text: "The _que_ is optional: _Ojalá venga_ and _Ojalá que venga_ mean the same." },
      ],
    },
    {
      kind: "teach",
      title: "A hope or a wish?",
      blocks: [
        { type: "text", text: "The subjunctive's tense shows how likely you think it is." },
        { type: "example", label: "Possible", es: "Ojalá **tenga** tiempo.", en: "I hope I have time." },
        { type: "example", label: "Unlikely", es: "Ojalá **tuviera** tiempo.", en: "I wish I had time." },
        {
          type: "note",
          text: "_Espero que_ (I hope that) works the same way for real hopes: _Espero que estés bien._",
        },
      ],
    },
    {
      kind: "choice",
      text: "Ojalá ___ buen tiempo el fin de semana.",
      options: [
        { text: "haga", right: true, why: "Ojalá always takes the subjunctive, and this is a real hope, so present." },
        { text: "hace", why: "Hace is indicative. After ojalá the verb is always subjunctive." },
        { text: "hará", why: "The future is indicative too. Ojalá needs the subjunctive." },
      ],
    },
    {
      kind: "choice",
      text: "No tengo coche. ¡Ojalá ___ uno!",
      options: [
        { text: "tuviera", right: true, why: "You don't have one, so it's a wish about what isn't so: imperfect subjunctive." },
        { text: "tenga", why: "Tenga hopes for something possible. You've just said you don't have a car." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "Espero que ___ bien.", verb: "estar", tense: "subj", person: 1 },
    { kind: "type", prompt: "Your turn", text: "Ojalá que ellos ___ pronto.", verb: "volver", tense: "subj", person: 5 },
    { kind: "type", prompt: "Now a wish", text: "Ojalá ___ hablar japonés.", verb: "saber", tense: "impsubj", person: 0 },
  ],
  finish: {
    title: "You can hope and wish in Spanish",
    recap: [
      "_Ojalá (que)_ is always followed by the subjunctive.",
      "Present subjunctive for real hopes: _Ojalá tenga tiempo._",
      "Imperfect subjunctive for wishes about what isn't so: _Ojalá tuviera tiempo._",
    ],
    drill: { tenses: ["subj", "impsubj"], label: "Drill the subjunctive" },
  },
}

/** In the order they're suggested: the "Up next" lesson is the first one not finished yet. */
/** Suggested order: easiest first, so the list's level groups read top to bottom in this order. */
export const LESSONS: Lesson[] = [SER_ESTAR, POR_PARA, PRETERITE_IMPERFECT, OJALA, SI_CLAUSES]

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
