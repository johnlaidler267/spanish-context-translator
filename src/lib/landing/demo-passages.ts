/**
 * Hand-written, pre-broken-down passages for the first-visit demo on the landing page
 * (src/components/landing/landing-demo.tsx).
 *
 * Stored rather than generated: a first-time visitor sees the reader working instantly, with no
 * AI call, no loading state and no cost per visit. Each chunk follows the same shape the reader
 * gets from the model (meaning, optional literal, optional note -- see chunk-reconcile.ts), so the
 * demo teaches exactly what the real reader will show them.
 */

export type DemoLanguage = "spanish" | "french"
export type DemoLevel = "beginner" | "intermediate" | "advanced"

export interface DemoChunk {
  /** The text as it appears in the passage (punctuation included). */
  text: string
  /** What it means in English. */
  meaning: string
  /** Word-for-word rendering, when it differs enough to be worth showing. */
  literal?: string
  /** A short grammar or usage note. */
  note?: string
}

export interface DemoPassage {
  chunks: DemoChunk[]
  /** Index of the chunk shown expanded before the visitor touches anything. */
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
    beginner: {
      initial: 5,
      chunks: [
        { text: "Hola,", meaning: "Hi," },
        { text: "me llamo Ana.", meaning: "my name is Ana.", literal: "I call myself Ana." },
        { text: "Vivo en Madrid", meaning: "I live in Madrid" },
        { text: "con mi gato.", meaning: "with my cat." },
        { text: "Por la mañana", meaning: "In the morning", literal: "By the morning" },
        {
          text: "tomo un café",
          meaning: "I have a coffee",
          literal: "I take a coffee",
          note: "Spanish uses tomar (to take) for drinks and meals.",
        },
        { text: "y después", meaning: "and then", literal: "and after" },
        { text: "voy al trabajo", meaning: "I go to work", note: "al = a + el (to the)." },
        { text: "en metro.", meaning: "on the subway.", literal: "in metro." },
      ],
    },
    intermediate: {
      initial: 2,
      chunks: [
        { text: "Ayer", meaning: "Yesterday" },
        { text: "mi hermana me dijo", meaning: "my sister told me" },
        {
          text: "que le daba igual",
          meaning: "that she didn't care",
          literal: "that it gave her equal",
          note: "Very common. Me da igual = \"I don't mind / whatever.\"",
        },
        { text: "dónde cenar,", meaning: "where we had dinner," },
        { text: "pero cuando llegamos al restaurante", meaning: "but when we got to the restaurant" },
        {
          text: "puso el grito en el cielo",
          meaning: "she hit the roof",
          literal: "she put the scream in the sky",
          note: "An idiom for getting loudly upset.",
        },
        { text: "porque estaba cerrado.", meaning: "because it was closed." },
        { text: "Al final", meaning: "In the end" },
        {
          text: "nos tocó pedir pizza",
          meaning: "we were stuck ordering pizza",
          literal: "it touched us to order pizza",
          note: "Tocar here means \"it fell to us / we had to.\"",
        },
        { text: "y, la verdad,", meaning: "and honestly,", literal: "and, the truth," },
        { text: "me supo a gloria.", meaning: "it tasted amazing.", literal: "it tasted to me of glory." },
      ],
    },
    advanced: {
      initial: 0,
      chunks: [
        {
          text: "Por más que le dé vueltas,",
          meaning: "No matter how much I turn it over,",
          literal: "However much I give it turns,",
          note: "Por más que takes the subjunctive (dé) when it means \"no matter how much.\"",
        },
        { text: "no logro entender", meaning: "I can't work out", literal: "I don't manage to understand" },
        {
          text: "cómo se las arregló",
          meaning: "how he managed",
          literal: "how he arranged them for himself",
          note: "Arreglárselas = to manage, to get by.",
        },
        {
          text: "para salirse con la suya.",
          meaning: "to get his way.",
          literal: "to leave with his own.",
        },
        {
          text: "Si lo hubiera sabido,",
          meaning: "If I had known,",
          note: "Pluperfect subjunctive: the usual \"if I had…\" in Spanish.",
        },
        { text: "no me habría metido", meaning: "I wouldn't have gotten myself", literal: "I wouldn't have put myself" },
        { text: "en este lío.", meaning: "into this mess." },
      ],
    },
  },
  french: {
    beginner: {
      initial: 1,
      chunks: [
        { text: "Bonjour,", meaning: "Hi," },
        { text: "je m'appelle Léa.", meaning: "my name is Léa.", literal: "I call myself Léa." },
        { text: "J'habite à Lyon", meaning: "I live in Lyon" },
        { text: "avec mon chien.", meaning: "with my dog." },
        { text: "Le matin,", meaning: "In the morning,", literal: "The morning," },
        { text: "je bois un café,", meaning: "I drink a coffee," },
        { text: "puis", meaning: "then" },
        { text: "je vais au travail", meaning: "I go to work", note: "au = à + le (to the)." },
        { text: "à vélo.", meaning: "by bike.", literal: "at bike." },
      ],
    },
    intermediate: {
      initial: 5,
      chunks: [
        { text: "Hier,", meaning: "Yesterday," },
        { text: "mon frère m'a dit", meaning: "my brother told me" },
        {
          text: "que ça lui était égal",
          meaning: "that he didn't care",
          literal: "that it was equal to him",
          note: "Ça m'est égal = \"I don't mind.\"",
        },
        { text: "où on dînait,", meaning: "where we had dinner," },
        { text: "mais quand on est arrivés au restaurant,", meaning: "but when we got to the restaurant," },
        {
          text: "il est tombé des nues :",
          meaning: "he was stunned:",
          literal: "he fell from the clouds:",
          note: "An idiom for being completely taken by surprise.",
        },
        { text: "c'était fermé.", meaning: "it was closed." },
        { text: "Du coup,", meaning: "So,", note: "Very common in speech: \"as a result / so.\"" },
        { text: "on a commandé une pizza", meaning: "we ordered a pizza", note: "On is everyday French for \"we.\"" },
        { text: "et, franchement,", meaning: "and, honestly," },
        { text: "elle était à tomber.", meaning: "it was to die for.", literal: "it was to fall." },
      ],
    },
    advanced: {
      initial: 0,
      chunks: [
        {
          text: "J'ai beau y réfléchir,",
          meaning: "However much I think about it,",
          literal: "I have beautiful to think about it,",
          note: "Avoir beau + infinitive = \"no matter how much…\"",
        },
        {
          text: "je n'arrive pas à comprendre",
          meaning: "I can't understand",
          literal: "I don't arrive at understanding",
        },
        {
          text: "comment il s'en est sorti.",
          meaning: "how he got out of it.",
          note: "S'en sortir = to pull through, to get out of a fix.",
        },
        { text: "Si j'avais su,", meaning: "If I had known," },
        {
          text: "je ne me serais jamais fourré",
          meaning: "I would never have gotten myself",
          literal: "I would never have stuffed myself",
        },
        {
          text: "dans ce pétrin.",
          meaning: "into this mess.",
          literal: "into this kneading trough.",
        },
      ],
    },
  },
}

export function isDemoLanguage(lang: string): lang is DemoLanguage {
  return lang === "spanish" || lang === "french"
}
