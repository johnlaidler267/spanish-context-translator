/**
 * Text around the first-visit demo (landing hero + demo controls), in the reader's own language:
 * English for Spanish/French learners, Spanish or French for English learners.
 */

import type {
  LanguageLearningPreferences,
  LearningLanguage,
  NativeLanguage,
} from "@/lib/storage/language-learning-preferences"
import type { DemoLevel } from "@/lib/landing/demo-passages"

export interface DemoCopy {
  /** HTML lang attribute for this copy. */
  lang: string
  languageName: Record<LearningLanguage, string>
  /** "For Spanish learners" — eyebrow, before the desktop/mobile tails. */
  eyebrow: (language: LearningLanguage) => string
  eyebrowDesktopTail: string
  eyebrowMobileTail: string
  /** "Read real Spanish." */
  readReal: (language: LearningLanguage) => string
  hoverVerb: string
  tapVerb: string
  /** "to see what it means" (follows the verb), then ", and why" on desktop. */
  seeMeaning: string
  andWhy: string
  sub: (language: LearningLanguage) => string
  freeNote: string
  /** Composer placeholder under the demo: "Paste your own Spanish…" */
  pasteOwn: (language: LearningLanguage) => string
  tryIt: string
  languageGroup: string
  levelGroup: string
  levels: Record<DemoLevel, string>
}

const ENGLISH: DemoCopy = {
  lang: "en",
  languageName: { spanish: "Spanish", french: "French", english: "English" },
  eyebrow: (l) => `For ${ENGLISH.languageName[l]} learners`,
  eyebrowDesktopTail: ", from first sentences to full novels",
  eyebrowMobileTail: ", any level",
  readReal: (l) => `Read real ${ENGLISH.languageName[l]}.`,
  hoverVerb: "Hover any phrase",
  tapVerb: "Tap any phrase",
  seeMeaning: "to see what it means",
  andWhy: ", and why",
  sub: (l) => {
    const name = ENGLISH.languageName[l]
    return `Not a word-by-word translation. LexaLens breaks each sentence into the chunks ${name} speakers actually think in, so you keep reading in ${name}.`
  },
  freeNote: "Free · No account needed",
  pasteOwn: (l) => `Paste your own ${ENGLISH.languageName[l]}…`,
  tryIt: "Try it",
  languageGroup: "Language",
  levelGroup: "Level",
  levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
}

const SPANISH: DemoCopy = {
  lang: "es",
  languageName: { spanish: "español", french: "francés", english: "inglés" },
  eyebrow: (l) => `Para quienes aprenden ${SPANISH.languageName[l]}`,
  eyebrowDesktopTail: ", de las primeras frases a novelas enteras",
  eyebrowMobileTail: ", cualquier nivel",
  readReal: (l) => `Lee ${SPANISH.languageName[l]} de verdad.`,
  hoverVerb: "Pasa el cursor por una frase",
  tapVerb: "Toca cualquier frase",
  seeMeaning: "para ver qué significa",
  andWhy: " y por qué",
  sub: (l) => {
    const name = SPANISH.languageName[l]
    return `No es una traducción palabra por palabra. LexaLens divide cada oración en los bloques con los que piensa quien habla ${name}, para que sigas leyendo en ${name}.`
  },
  freeNote: "Gratis · Sin crear cuenta",
  pasteOwn: (l) => `Pega tu propio texto en ${SPANISH.languageName[l]}…`,
  tryIt: "Pruébalo",
  languageGroup: "Idioma",
  levelGroup: "Nivel",
  levels: { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" },
}

const FRENCH: DemoCopy = {
  lang: "fr",
  languageName: { spanish: "espagnol", french: "français", english: "anglais" },
  eyebrow: (l) =>
    `Pour celles et ceux qui apprennent ${{ english: "l'anglais", spanish: "l'espagnol", french: "le français" }[l]}`,
  eyebrowDesktopTail: ", des premières phrases aux romans entiers",
  eyebrowMobileTail: ", tous niveaux",
  readReal: (l) => `Lisez du vrai ${FRENCH.languageName[l]}.`,
  hoverVerb: "Survolez une expression",
  tapVerb: "Touchez une expression",
  seeMeaning: "pour voir ce qu'elle veut dire",
  andWhy: ", et pourquoi",
  sub: (l) => {
    const name = FRENCH.languageName[l]
    return `Pas une traduction mot à mot. LexaLens découpe chaque phrase en blocs, tels que les pense quelqu'un qui parle ${name}, pour que vous continuiez à lire en ${name}.`
  },
  freeNote: "Gratuit · Sans compte",
  pasteOwn: (l) => `Collez votre propre texte en ${FRENCH.languageName[l]}…`,
  tryIt: "Essayez",
  languageGroup: "Langue",
  levelGroup: "Niveau",
  levels: { beginner: "Débutant", intermediate: "Intermédiaire", advanced: "Avancé" },
}

const COPY: Record<NativeLanguage, DemoCopy> = { english: ENGLISH, spanish: SPANISH, french: FRENCH }

/** The reader's own language is the one their explanations come in. */
export function demoCopyFor(prefs: LanguageLearningPreferences): DemoCopy {
  return COPY[prefs.native]
}

/**
 * The demo's two language buttons. An English-speaking visitor picks Spanish or French. A
 * Spanish- or French-speaking one (by their choice so far, or their browser's language) gets
 * English, plus their own language for learners who set their phone to it for practice.
 */
export function demoLanguageOptions(
  prefs: LanguageLearningPreferences,
  browserNative: NativeLanguage,
): LanguageLearningPreferences[] {
  const visitor = prefs.learning === "english" ? prefs.native : browserNative
  if (visitor === "english") {
    return [
      { learning: "spanish", native: "english" },
      { learning: "french", native: "english" },
    ]
  }
  return [
    { learning: "english", native: visitor },
    { learning: visitor, native: "english" },
  ]
}
