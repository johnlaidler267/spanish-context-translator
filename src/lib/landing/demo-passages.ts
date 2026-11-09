/**
 * Hand-written, pre-broken-down passages for the first-visit demo on the landing page
 * (src/components/landing/landing-demo.tsx).
 *
 * Stored rather than generated: a first-time visitor sees the reader working instantly, with no
 * AI call, no loading state and no cost per visit. Chunked by the same rules the real reader
 * gives the model (lib/translate/chunk-sort-prompt.ts): one word per chunk by default, grouped
 * only for idioms, connectors, verb + fixed preposition, clitic clusters and the like -- so the
 * demo shows exactly what the reader will.
 */

export type DemoLanguage = "spanish" | "french"
export type DemoLevel = "beginner" | "intermediate" | "advanced"

export interface DemoChunk {
  /** The words as they appear in the passage (no surrounding punctuation). */
  text: string
  /** What it means in English. */
  meaning: string
  /** Word-for-word rendering, when it differs enough to be worth showing. */
  literal?: string
  /** A short grammar or usage note. */
  note?: string
  /** What follows the chunk in the passage: punctuation and/or a space. Default " ". */
  after?: string
}

export interface DemoPassage {
  chunks: DemoChunk[]
  /** Index of the chunk whose tooltip is open before the visitor touches anything. Keep it off
   *  the first line: an open tooltip sits above its phrase and would cover the controls. */
  initial: number
}

export const DEMO_LEVELS: { id: DemoLevel; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
]

export const DEFAULT_DEMO_LEVEL: DemoLevel = "intermediate"

export const DEMO_PASSAGES: Record<DemoLanguage, Record<DemoLevel, DemoPassage>> = {
  spanish: {
    // Hola, me llamo Ana. Vivo en Madrid con mi gato. Por la mañana tomo un café y después voy al trabajo en metro.
    beginner: {
      initial: 9,
      chunks: [
        { text: "Hola", meaning: "Hi", after: ", " },
        { text: "me llamo", meaning: "my name is", literal: "I call myself", note: "llamarse = to be called" },
        { text: "Ana", meaning: "Ana", after: ". " },
        { text: "Vivo", meaning: "I live" },
        { text: "en", meaning: "in" },
        { text: "Madrid", meaning: "Madrid" },
        { text: "con", meaning: "with" },
        { text: "mi", meaning: "my" },
        { text: "gato", meaning: "cat", after: ". " },
        { text: "Por la mañana", meaning: "in the morning", literal: "by the morning" },
        { text: "tomo", meaning: "I have", literal: "I take", note: "Spanish uses tomar for drinks and meals" },
        { text: "un", meaning: "a" },
        { text: "café", meaning: "coffee" },
        { text: "y", meaning: "and" },
        { text: "después", meaning: "afterwards" },
        { text: "voy", meaning: "I go", note: "ir is irregular: voy, vas, va…" },
        { text: "al", meaning: "to the", note: "al = a + el" },
        { text: "trabajo", meaning: "work" },
        { text: "en metro", meaning: "by subway", literal: "in metro", note: "en + transport = by", after: "." },
      ],
    },
    // Ayer mi hermana me dijo que le daba igual dónde cenar, pero cuando llegamos al restaurante puso el
    // grito en el cielo porque estaba cerrado. Al final nos tocó pedir pizza y, la verdad, me supo a gloria.
    intermediate: {
      initial: 14,
      chunks: [
        { text: "Ayer", meaning: "yesterday" },
        { text: "mi", meaning: "my" },
        { text: "hermana", meaning: "sister" },
        { text: "me", meaning: "(to) me" },
        { text: "dijo", meaning: "told", literal: "said", note: "preterite of decir (irregular)" },
        { text: "que", meaning: "that" },
        {
          text: "le daba igual",
          meaning: "she didn't care",
          literal: "to her it gave equal",
          note: "dar igual = not to mind; me da igual = whatever",
        },
        { text: "dónde", meaning: "where" },
        { text: "cenar", meaning: "to have dinner", after: ", " },
        { text: "pero", meaning: "but" },
        { text: "cuando", meaning: "when" },
        { text: "llegamos", meaning: "we got", literal: "we arrived" },
        { text: "al", meaning: "to the", note: "al = a + el" },
        { text: "restaurante", meaning: "restaurant" },
        {
          text: "puso el grito en el cielo",
          meaning: "she hit the roof",
          literal: "she put the scream in the sky",
          note: "idiom: to get loudly upset",
        },
        { text: "porque", meaning: "because" },
        { text: "estaba", meaning: "it was", note: "estar for a temporary state" },
        { text: "cerrado", meaning: "closed", after: ". " },
        { text: "Al final", meaning: "in the end", literal: "at the end" },
        {
          text: "nos tocó",
          meaning: "we were stuck",
          literal: "it touched us",
          note: "tocarle a alguien = to fall to someone",
        },
        { text: "pedir", meaning: "ordering", literal: "to order" },
        { text: "pizza", meaning: "pizza" },
        { text: "y", meaning: "and", after: ", " },
        { text: "la verdad", meaning: "honestly", literal: "the truth", after: ", " },
        {
          text: "me supo a gloria",
          meaning: "it tasted amazing",
          literal: "it tasted to me of glory",
          note: "saber a gloria = to taste heavenly",
          after: ".",
        },
      ],
    },
    // Por más que le dé vueltas, no logro entender cómo se las arregló para salirse con la suya.
    // Si lo hubiera sabido, no me habría metido en este lío.
    advanced: {
      initial: 6,
      chunks: [
        {
          text: "Por más que",
          meaning: "no matter how much",
          literal: "for more that",
          note: "takes the subjunctive here",
        },
        {
          text: "le dé vueltas",
          meaning: "I mull it over",
          literal: "I give it turns",
          note: "darle vueltas a algo = to mull over; dé is subjunctive",
          after: ", ",
        },
        { text: "no", meaning: "not" },
        { text: "logro", meaning: "I manage", note: "lograr + infinitive = to manage to" },
        { text: "entender", meaning: "to understand" },
        { text: "cómo", meaning: "how" },
        {
          text: "se las arregló",
          meaning: "he managed",
          literal: "he arranged them for himself",
          note: "arreglárselas = to get by, to pull it off",
        },
        { text: "para", meaning: "to", literal: "in order to" },
        { text: "salirse con la suya", meaning: "get his way", literal: "leave with his own", after: ". " },
        { text: "Si", meaning: "if" },
        { text: "lo", meaning: "it" },
        { text: "hubiera sabido", meaning: "I had known", note: "pluperfect subjunctive after si", after: ", " },
        { text: "no", meaning: "not" },
        {
          text: "me habría metido",
          meaning: "I would have gotten myself",
          literal: "I would have put myself",
          note: "meterse en = to get into",
        },
        { text: "en", meaning: "into" },
        { text: "este", meaning: "this" },
        { text: "lío", meaning: "mess", after: "." },
      ],
    },
  },
  french: {
    // Bonjour, je m'appelle Léa. J'habite à Lyon avec mon chien. Le matin, je bois un café, puis je vais au travail à vélo.
    beginner: {
      initial: 21,
      chunks: [
        { text: "Bonjour", meaning: "hi", after: ", " },
        { text: "je", meaning: "I" },
        { text: "m'appelle", meaning: "am called", literal: "call myself", note: "s'appeler = to be called" },
        { text: "Léa", meaning: "Léa", after: ". " },
        { text: "J'", meaning: "I", after: "" },
        { text: "habite", meaning: "live" },
        { text: "à", meaning: "in" },
        { text: "Lyon", meaning: "Lyon" },
        { text: "avec", meaning: "with" },
        { text: "mon", meaning: "my" },
        { text: "chien", meaning: "dog", after: ". " },
        { text: "Le matin", meaning: "in the morning", literal: "the morning", note: "no preposition needed", after: ", " },
        { text: "je", meaning: "I" },
        { text: "bois", meaning: "drink", note: "boire is irregular: je bois" },
        { text: "un", meaning: "a" },
        { text: "café", meaning: "coffee", after: ", " },
        { text: "puis", meaning: "then" },
        { text: "je", meaning: "I" },
        { text: "vais", meaning: "go", note: "aller is irregular: je vais" },
        { text: "au", meaning: "to the", note: "au = à + le" },
        { text: "travail", meaning: "work" },
        { text: "à vélo", meaning: "by bike", literal: "at bike", note: "à vélo, à pied, but en voiture", after: "." },
      ],
    },
    // Hier, mon frère m'a dit que ça lui était égal où on dînait, mais quand on est arrivés au restaurant,
    // il est tombé des nues : c'était fermé. Du coup, on a commandé une pizza et, franchement, elle était à tomber.
    intermediate: {
      initial: 17,
      chunks: [
        { text: "Hier", meaning: "yesterday", after: ", " },
        { text: "mon", meaning: "my" },
        { text: "frère", meaning: "brother" },
        { text: "m'", meaning: "(to) me", after: "" },
        { text: "a dit", meaning: "told", literal: "has said", note: "passé composé of dire" },
        { text: "que", meaning: "that" },
        {
          text: "ça lui était égal",
          meaning: "he didn't care",
          literal: "that was equal to him",
          note: "ça m'est égal = I don't mind",
        },
        { text: "où", meaning: "where" },
        { text: "on", meaning: "we", note: "on = everyday \"we\"" },
        { text: "dînait", meaning: "had dinner", note: "imperfect" , after: ", " },
        { text: "mais", meaning: "but" },
        { text: "quand", meaning: "when" },
        { text: "on", meaning: "we" },
        { text: "est arrivés", meaning: "got", literal: "is arrived", note: "arriver takes être" },
        { text: "au", meaning: "to the", note: "au = à + le" },
        { text: "restaurant", meaning: "restaurant", after: ", " },
        { text: "il", meaning: "he" },
        {
          text: "est tombé des nues",
          meaning: "was stunned",
          literal: "fell from the clouds",
          note: "idiom: to be completely taken aback",
          after: " : ",
        },
        { text: "c'", meaning: "it", after: "" },
        { text: "était", meaning: "was" },
        { text: "fermé", meaning: "closed", after: ". " },
        { text: "Du coup", meaning: "so", literal: "of the blow", note: "very common in speech", after: ", " },
        { text: "on", meaning: "we" },
        { text: "a commandé", meaning: "ordered", literal: "has ordered" },
        { text: "une", meaning: "a" },
        { text: "pizza", meaning: "pizza" },
        { text: "et", meaning: "and", after: ", " },
        { text: "franchement", meaning: "honestly", after: ", " },
        { text: "elle", meaning: "it", note: "pizza is feminine" },
        { text: "était", meaning: "was" },
        { text: "à tomber", meaning: "to die for", literal: "to fall", note: "colloquial: amazing", after: "." },
      ],
    },
    // J'ai beau y réfléchir, je n'arrive pas à comprendre comment il s'en est sorti.
    // Si j'avais su, je ne me serais jamais fourré dans ce pétrin.
    advanced: {
      initial: 12,
      chunks: [
        { text: "J'", meaning: "I", after: "" },
        {
          text: "ai beau",
          meaning: "no matter how much",
          literal: "have beautiful",
          note: "avoir beau + infinitive = however much…",
        },
        { text: "y", meaning: "about it" },
        { text: "réfléchir", meaning: "think", after: ", " },
        { text: "je", meaning: "I" },
        { text: "n'", meaning: "not", note: "ne…pas wraps the verb", after: "" },
        { text: "arrive", meaning: "manage", literal: "arrive", note: "arriver à + infinitive = to manage to" },
        { text: "pas", meaning: "not", literal: "step", note: "second half of ne…pas" },
        { text: "à", meaning: "to" },
        { text: "comprendre", meaning: "understand" },
        { text: "comment", meaning: "how" },
        { text: "il", meaning: "he" },
        { text: "s'en est sorti", meaning: "got out of it", note: "s'en sortir = to pull through", after: ". " },
        { text: "Si", meaning: "if" },
        { text: "j'", meaning: "I", after: "" },
        { text: "avais su", meaning: "had known", note: "plus-que-parfait after si", after: ", " },
        { text: "je", meaning: "I" },
        { text: "ne", meaning: "not", note: "ne…jamais wraps the verb" },
        { text: "me", meaning: "myself" },
        { text: "serais", meaning: "would have", note: "conditionnel passé, with être (reflexive)" },
        { text: "jamais", meaning: "never" },
        { text: "fourré", meaning: "gotten", literal: "stuffed", note: "se fourrer dans = to get oneself into" },
        { text: "dans", meaning: "into" },
        { text: "ce", meaning: "this" },
        { text: "pétrin", meaning: "mess", literal: "kneading trough", note: "être dans le pétrin = to be in a fix", after: "." },
      ],
    },
  },
}

export function isDemoLanguage(lang: string): lang is DemoLanguage {
  return lang === "spanish" || lang === "french"
}
