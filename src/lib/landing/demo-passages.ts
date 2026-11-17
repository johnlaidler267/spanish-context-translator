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

import type { NativeLanguage } from "@/lib/storage/language-learning-preferences"

export type DemoLanguage = "spanish" | "french" | "english"
/** Languages whose passages are glossed in English (the Spanish and French demos). */
type EnglishGlossedDemoLanguage = Exclude<DemoLanguage, "english">
/** The languages an English passage is glossed in: an English learner's native language. */
export type EnglishDemoNative = Exclude<NativeLanguage, "english">
export type DemoLevel = "beginner" | "intermediate" | "advanced"

export interface DemoChunk {
  /** The words as they appear in the passage (no surrounding punctuation). */
  text: string
  /** What it means in the reader's language (English for the Spanish/French passages). */
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

export const DEMO_PASSAGES: Record<EnglishGlossedDemoLanguage, Record<DemoLevel, DemoPassage>> = {
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

type Gloss = Pick<DemoChunk, "meaning" | "literal" | "note">

/** An English phrase with its meaning in each language an English learner can have as native. */
interface EnglishDemoChunk {
  text: string
  es: Gloss
  fr: Gloss
  after?: string
}

interface EnglishDemoPassage {
  chunks: EnglishDemoChunk[]
  initial: number
}

/**
 * English passages for Spanish- and French-speaking learners, glossed in their own language.
 * Same stories and levels as the Spanish passages above, written as natural English rather than
 * translated word for word, and chunked by the same rules.
 */
export const ENGLISH_DEMO_PASSAGES: Record<DemoLevel, EnglishDemoPassage> = {
  // Hi, my name is Sam. I live in Chicago with my dog. In the morning I have a coffee, and then I
  // take the bus to work.
  beginner: {
    initial: 10,
    chunks: [
      { text: "Hi", es: { meaning: "hola" }, fr: { meaning: "salut" }, after: ", " },
      {
        text: "my name is",
        es: { meaning: "me llamo", literal: "mi nombre es" },
        fr: { meaning: "je m'appelle", literal: "mon nom est" },
      },
      { text: "Sam", es: { meaning: "Sam" }, fr: { meaning: "Sam" }, after: ". " },
      {
        text: "I live",
        es: { meaning: "vivo", literal: "yo vivo", note: "en inglés el sujeto (I) nunca se omite" },
        fr: { meaning: "j'habite", literal: "je vis" },
      },
      { text: "in", es: { meaning: "en" }, fr: { meaning: "à" } },
      { text: "Chicago", es: { meaning: "Chicago" }, fr: { meaning: "Chicago" } },
      { text: "with", es: { meaning: "con" }, fr: { meaning: "avec" } },
      { text: "my", es: { meaning: "mi" }, fr: { meaning: "mon" } },
      { text: "dog", es: { meaning: "perro" }, fr: { meaning: "chien" }, after: ". " },
      {
        text: "In the morning",
        es: { meaning: "por la mañana", literal: "en la mañana" },
        fr: { meaning: "le matin", literal: "dans le matin" },
      },
      {
        text: "I have",
        es: { meaning: "tomo", literal: "tengo", note: "have se usa para comidas y bebidas: have breakfast, have a coffee" },
        fr: { meaning: "je bois", literal: "j'ai", note: "have s'utilise pour les repas et les boissons : have lunch, have a coffee" },
      },
      { text: "a", es: { meaning: "un" }, fr: { meaning: "un" } },
      { text: "coffee", es: { meaning: "café" }, fr: { meaning: "café" }, after: ", " },
      { text: "and then", es: { meaning: "y luego" }, fr: { meaning: "et ensuite" } },
      { text: "I take", es: { meaning: "tomo" }, fr: { meaning: "je prends" } },
      { text: "the bus", es: { meaning: "el autobús" }, fr: { meaning: "le bus" } },
      {
        text: "to work",
        es: { meaning: "al trabajo", note: "sin artículo: go to work, at work" },
        fr: { meaning: "au travail", note: "sans article : go to work, at work" },
        after: ".",
      },
    ],
  },
  // Yesterday my sister told me she didn't mind where we ate, but when we got to the restaurant she
  // hit the roof because it was closed. In the end we had to order pizza, and honestly, it hit the spot.
  intermediate: {
    initial: 14,
    chunks: [
      { text: "Yesterday", es: { meaning: "ayer" }, fr: { meaning: "hier" } },
      { text: "my", es: { meaning: "mi" }, fr: { meaning: "ma" } },
      { text: "sister", es: { meaning: "hermana" }, fr: { meaning: "sœur" } },
      {
        text: "told me",
        es: { meaning: "me dijo", note: "tell + persona, sin «to»: tell me, tell her" },
        fr: { meaning: "m'a dit", note: "tell + personne, sans « to » : tell me, tell her" },
      },
      {
        text: "she",
        es: { meaning: "(ella)", note: "en inglés el sujeto nunca se omite" },
        fr: { meaning: "elle" },
      },
      {
        text: "didn't mind",
        es: { meaning: "le daba igual", literal: "no le molestaba", note: "mind = importar, molestar; I don't mind = me da igual" },
        fr: { meaning: "ça lui était égal", literal: "ne la dérangeait pas", note: "mind = déranger ; I don't mind = ça m'est égal" },
      },
      { text: "where", es: { meaning: "dónde" }, fr: { meaning: "où" } },
      {
        text: "we ate",
        es: { meaning: "comíamos", note: "pasado irregular de eat: eat, ate, eaten" },
        fr: { meaning: "on mangeait", note: "passé irrégulier de eat : eat, ate, eaten" },
        after: ", ",
      },
      { text: "but", es: { meaning: "pero" }, fr: { meaning: "mais" } },
      { text: "when", es: { meaning: "cuando" }, fr: { meaning: "quand" } },
      {
        text: "we got to",
        es: { meaning: "llegamos a", note: "get to + lugar = llegar a" },
        fr: { meaning: "on est arrivés à", note: "get to + lieu = arriver à" },
      },
      { text: "the", es: { meaning: "el" }, fr: { meaning: "le" } },
      { text: "restaurant", es: { meaning: "restaurante" }, fr: { meaning: "restaurant" } },
      { text: "she", es: { meaning: "(ella)" }, fr: { meaning: "elle" } },
      {
        text: "hit the roof",
        es: { meaning: "puso el grito en el cielo", literal: "golpeó el techo", note: "expresión: enfadarse muchísimo" },
        fr: { meaning: "a piqué une crise", literal: "a frappé le plafond", note: "expression : se mettre très en colère" },
      },
      { text: "because", es: { meaning: "porque" }, fr: { meaning: "parce que" } },
      { text: "it was", es: { meaning: "estaba" }, fr: { meaning: "c'était" } },
      { text: "closed", es: { meaning: "cerrado" }, fr: { meaning: "fermé" }, after: ". " },
      { text: "In the end", es: { meaning: "al final" }, fr: { meaning: "finalement", literal: "à la fin" } },
      {
        text: "we had to",
        es: { meaning: "tuvimos que", note: "have to = tener que" },
        fr: { meaning: "on a dû", note: "have to = devoir" },
      },
      { text: "order", es: { meaning: "pedir" }, fr: { meaning: "commander" } },
      { text: "pizza", es: { meaning: "pizza" }, fr: { meaning: "une pizza" }, after: ", " },
      { text: "and", es: { meaning: "y" }, fr: { meaning: "et" } },
      { text: "honestly", es: { meaning: "la verdad", literal: "honestamente" }, fr: { meaning: "franchement", literal: "honnêtement" }, after: ", " },
      {
        text: "it hit the spot",
        es: { meaning: "me supo a gloria", literal: "dio en el punto", note: "expresión: justo lo que necesitabas, sobre todo comida o bebida" },
        fr: { meaning: "c'était parfait", literal: "ça a touché l'endroit", note: "expression : exactement ce qu'il fallait, surtout pour un repas" },
        after: ".",
      },
    ],
  },
  // No matter how much I mull it over, I can't figure out how he got away with it. Had I known, I'd
  // never have gotten myself into this mess.
  advanced: {
    initial: 6,
    chunks: [
      {
        text: "No matter how much",
        es: { meaning: "por más que", literal: "no importa cuánto", note: "no matter how / what / where = da igual cómo / qué / dónde" },
        fr: { meaning: "j'ai beau", literal: "peu importe combien", note: "no matter how / what / where = peu importe comment / quoi / où" },
      },
      {
        text: "I mull it over",
        es: { meaning: "le doy vueltas", literal: "lo rumio", note: "mull over = darle vueltas a algo; el pronombre va en medio" },
        fr: { meaning: "j'y réfléchis", literal: "je le rumine", note: "mull over = ressasser ; le pronom se place au milieu" },
        after: ", ",
      },
      {
        text: "I can't",
        es: { meaning: "no logro", literal: "no puedo" },
        fr: { meaning: "je n'arrive pas à", literal: "je ne peux pas" },
      },
      {
        text: "figure out",
        es: { meaning: "entender", note: "phrasal verb: figure out = descifrar, llegar a entender" },
        fr: { meaning: "comprendre", note: "verbe à particule : figure out = comprendre, déchiffrer" },
      },
      { text: "how", es: { meaning: "cómo" }, fr: { meaning: "comment" } },
      { text: "he", es: { meaning: "(él)" }, fr: { meaning: "il" } },
      {
        text: "got away with",
        es: { meaning: "se salió con la suya", literal: "se escapó con", note: "get away with something = librarse de las consecuencias" },
        fr: { meaning: "s'en est tiré", literal: "s'est échappé avec", note: "get away with something = s'en tirer sans conséquences" },
      },
      { text: "it", es: { meaning: "(eso)" }, fr: { meaning: "(ça)" }, after: ". " },
      {
        text: "Had I known",
        es: { meaning: "si lo hubiera sabido", literal: "hubiera yo sabido", note: "inversión formal de «If I had known»" },
        fr: { meaning: "si j'avais su", literal: "avais-je su", note: "inversion soutenue de « If I had known »" },
        after: ", ",
      },
      {
        text: "I'd never have gotten myself",
        es: { meaning: "nunca me habría metido", note: "I'd = I would; get yourself into = meterse en" },
        fr: { meaning: "je ne me serais jamais fourré", note: "I'd = I would ; get yourself into = se fourrer dans" },
      },
      { text: "into", es: { meaning: "en" }, fr: { meaning: "dans" } },
      { text: "this", es: { meaning: "este" }, fr: { meaning: "ce" } },
      { text: "mess", es: { meaning: "lío" }, fr: { meaning: "pétrin" }, after: "." },
    ],
  },
}

/** The passage to show: Spanish/French glossed in English, English glossed in the reader's language. */
export function demoPassage(language: DemoLanguage, native: NativeLanguage, level: DemoLevel): DemoPassage {
  if (language !== "english") return DEMO_PASSAGES[language][level]
  const source = ENGLISH_DEMO_PASSAGES[level]
  const key = native === "french" ? "fr" : "es"
  return {
    initial: source.initial,
    chunks: source.chunks.map(({ text, after, [key]: gloss }) => ({ text, after, ...gloss })),
  }
}

export function isDemoLanguage(lang: string): lang is DemoLanguage {
  return lang === "spanish" || lang === "french" || lang === "english"
}
