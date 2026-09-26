import { formatSubstringChunkRulesForPrompt } from "@/config/chunk-group-hints"
import {
  getStoredLanguageLearningPreferences,
  LEARNING_LANGUAGE_LABEL,
  type LanguageLearningPreferences,
  type LearningLanguage,
} from "@/lib/storage/language-learning-preferences"

type ChunkExampleRow = { c: string; m: string; l: string; n?: string }

/** Everything that differs between translate pairs; the rules around it are shared. */
type ChunkPromptVariant = {
  /** Language of the TEXT, e.g. "Spanish". */
  source: string
  /** Language `m`, `l` and `n` are written in. */
  gloss: string
  /** Multi-word patterns worth grouping, as `name: e.g. …` lines. */
  groupCategories: string[]
  /** Words that must stay separate, with a short example. */
  keepSeparate: string
  /** One worked sentence showing singles, groups, and when `n` is (not) used. */
  example: { text: string; rows: ChunkExampleRow[] }
}

const SPANISH_TO_ENGLISH: ChunkPromptVariant = {
  source: "Spanish",
  gloss: "English",
  groupCategories: [
    "fixed idioms: dar su brazo a torcer, a punto de, hace falta",
    "multi-word connectors: mientras que, sin embargo, a pesar de, antes de que",
    "lo + adjective: lo maravilloso, lo mejor",
    "verb + fixed preposition: darse cuenta de que, tratar de, pensar en",
    "possessive pronouns: el suyo, la mía",
    "multi-word proper nouns: Buenos Aires, Nueva York",
    "clitic clusters: se lo, me la",
    "reciprocal phrases: unos a otros, el uno al otro",
    "adverbial phrases: por supuesto, de vez en cuando, al menos",
    "colloquial set expressions: pinta bien, ¿qué tal?",
  ],
  keepSeparate: `articles, nouns and adjectives ("la casa roja" → "la", "casa", "roja"); a verb and its ordinary object; subject pronouns`,
  example: {
    text: "Por supuesto, se lo dije a Ana mientras que ella se daba cuenta de que la casa estaba vacía.",
    rows: [
      { c: "Por supuesto", m: "of course", l: "by supposed" },
      { c: "se lo", m: "it to her", l: "to-her it", n: "\"se\" replaces \"le\" before lo/la" },
      { c: "dije", m: "I told", l: "I said", n: "preterite of decir (irregular)" },
      { c: "a", m: "to", l: "to" },
      { c: "Ana", m: "Ana", l: "Ana" },
      { c: "mientras que", m: "while", l: "while that" },
      { c: "ella", m: "she", l: "she" },
      {
        c: "se daba cuenta de que",
        m: "was realizing that",
        l: "herself was giving account of that",
        n: "darse cuenta de = to realize; imperfect = ongoing",
      },
      { c: "la", m: "the", l: "the" },
      { c: "casa", m: "house", l: "house" },
      { c: "estaba", m: "was", l: "was", n: "estar for a temporary state" },
      { c: "vacía", m: "empty", l: "empty" },
    ],
  },
}

const FRENCH_TO_ENGLISH: ChunkPromptVariant = {
  source: "French",
  gloss: "English",
  groupCategories: [
    "fixed idioms: avoir du mal à, à point nommé",
    "multi-word connectors: tandis que, alors que, bien que",
    "nominalized phrases: le beau, ce qui",
    "verb + fixed preposition: se rendre compte de, tenir à",
    "possessive pronouns: le sien, la leur",
    "multi-word proper nouns: Prix Nobel, Saint-Malo",
    "clitic clusters: me le, lui en, le lui",
    "reciprocal phrases: les uns les autres",
    "adverbial phrases: bien sûr, tout à coup, tout de suite",
    "colloquial set expressions: ça marche, c'est parti",
  ],
  keepSeparate: `articles, nouns and adjectives ("la maison rouge" → "la", "maison", "rouge"); the two halves of ne…pas (they are not adjacent); subject pronouns`,
  example: {
    text: "Tout à coup, il s'est rendu compte qu'il ne le lui avait pas dit.",
    rows: [
      { c: "Tout à coup", m: "suddenly", l: "all at blow" },
      { c: "il", m: "he", l: "he" },
      {
        c: "s'est rendu compte",
        m: "realized",
        l: "himself is rendered account",
        n: "se rendre compte = to realize; reflexive verbs take être",
      },
      { c: "qu'", m: "that", l: "that" },
      { c: "il", m: "he", l: "he" },
      { c: "ne", m: "not", l: "not", n: "ne…pas wraps the verb" },
      { c: "le lui", m: "it to him", l: "it to-him" },
      { c: "avait", m: "had", l: "had" },
      { c: "pas", m: "not", l: "step", n: "second half of ne…pas" },
      { c: "dit", m: "told", l: "said", n: "past participle of dire" },
    ],
  },
}

const ENGLISH_CATEGORIES = [
  "phrasal verbs: put up with, give in, carry on",
  "fixed idioms: by and large, to look forward to",
  "multi-word connectors: as long as, so that, even though",
  "verb + fixed preposition: rely on, deal with, insist on",
  "modal / auxiliary clusters: might have been, will have, is being",
  "multi-word proper nouns: New York, Nobel Prize",
  "reciprocal phrases: each other, one another",
  "adverbial phrases: all of a sudden, on the other hand, for good",
  "colloquial set expressions: no wonder, fair enough, that said",
  "compound nouns: air conditioning, birth rate",
]
const ENGLISH_KEEP_SEPARATE = `articles, nouns and adjectives ("the red house" → "the", "red", "house"); a verb and its ordinary object; subject pronouns`
const ENGLISH_EXAMPLE_TEXT =
  "All of a sudden, she gave up on the plan she had been looking forward to."

const ENGLISH_TO_FRENCH: ChunkPromptVariant = {
  source: "English",
  gloss: "French",
  groupCategories: ENGLISH_CATEGORIES,
  keepSeparate: ENGLISH_KEEP_SEPARATE,
  example: {
    text: ENGLISH_EXAMPLE_TEXT,
    rows: [
      { c: "All of a sudden", m: "tout à coup", l: "tout d'un soudain" },
      { c: "she", m: "elle", l: "elle" },
      { c: "gave up on", m: "a renoncé à", l: "a donné en haut sur", n: "verbe à particule : give up on = renoncer à" },
      { c: "the", m: "le", l: "le" },
      { c: "plan", m: "projet", l: "plan" },
      { c: "she", m: "elle", l: "elle" },
      {
        c: "had been looking forward to",
        m: "attendait avec impatience",
        l: "avait été regardant en avant à",
        n: "plus-que-parfait progressif ; look forward to + nom ou -ing",
      },
    ],
  },
}

const ENGLISH_TO_SPANISH: ChunkPromptVariant = {
  source: "English",
  gloss: "Spanish",
  groupCategories: ENGLISH_CATEGORIES,
  keepSeparate: ENGLISH_KEEP_SEPARATE,
  example: {
    text: ENGLISH_EXAMPLE_TEXT,
    rows: [
      { c: "All of a sudden", m: "de repente", l: "todo de un repentino" },
      { c: "she", m: "ella", l: "ella" },
      { c: "gave up on", m: "renunció a", l: "dio arriba sobre", n: "verbo frasal: give up on = renunciar a" },
      { c: "the", m: "el", l: "el" },
      { c: "plan", m: "plan", l: "plan" },
      { c: "she", m: "ella", l: "ella" },
      {
        c: "had been looking forward to",
        m: "tenía muchas ganas de",
        l: "había estado mirando adelante a",
        n: "pluscuamperfecto continuo; look forward to + sustantivo o -ing",
      },
    ],
  },
}

function variantFor(prefs: LanguageLearningPreferences): ChunkPromptVariant {
  if (prefs.learning === "english") {
    return prefs.native === "french" ? ENGLISH_TO_FRENCH : ENGLISH_TO_SPANISH
  }
  return prefs.learning === "french" ? FRENCH_TO_ENGLISH : SPANISH_TO_ENGLISH
}

function buildChunkSortSystemPrompt(v: ChunkPromptVariant): string {
  const exampleJson = `[\n${v.example.rows.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]`
  return `You split ${v.source} text into chunks for a language learner and gloss each chunk in ${v.gloss}.

RULES
1. Cover every word of the TEXT, in order, with nothing skipped or repeated. Punctuation may be left out.
2. "c" must be copied exactly from the TEXT (same spelling, accents and capitalization) and be one contiguous span.
3. Default to one word per chunk. Group neighboring words only when splitting them would hide the meaning, as in these patterns:
${v.groupCategories.map((line) => `   - ${line}`).join("\n")}
4. Keep these separate: ${v.keepSeparate}.

FIELDS (all in ${v.gloss})
- "c": the exact source span.
- "m": what the chunk means in this sentence, as it would read in a natural translation.
- "l": a word-for-word literal rendering, even if it sounds unnatural.
- "n": only for something a learner would trip on (irregular form, tense or mood choice, idiom, clitic). One short phrase. Omit it otherwise.

EXAMPLE
TEXT:
${v.example.text}

Output:
${exampleJson}

Reply with only the JSON array: no markdown fences, no commentary. The first character must be "[".`
}

function hintsSection(canonical: string): string {
  const hintsBlock = formatSubstringChunkRulesForPrompt(canonical)
  return hintsBlock ? `${hintsBlock}\n\n` : ""
}

/**
 * System + user messages for translate chunking. The system message holds the fixed rules and
 * worked example for the language pair; the user message holds optional substring hints from
 * {@link formatSubstringChunkRulesForPrompt} followed by `TEXT:`.
 */
export function buildChunkSortMessages(
  canonical: string,
  prefs: LanguageLearningPreferences = getStoredLanguageLearningPreferences(),
): { system: string; user: string } {
  return {
    system: buildChunkSortSystemPrompt(variantFor(prefs)),
    user: `${hintsSection(canonical)}TEXT:\n${canonical}`,
  }
}

function learnLanguageName(learning: LearningLanguage): string {
  return LEARNING_LANGUAGE_LABEL[learning]
}

export function randomShortParagraphUserPrompt(learning: LearningLanguage): string {
  const lang = learnLanguageName(learning)
  return `Write one short paragraph in natural ${lang} (about 3–5 sentences).

You choose the topic, setting, tone, and register freely — fiction, opinion, dialogue, description, anything. Be creative and make each response feel different when asked again.

Use idiomatic ${lang}. Return only the ${lang} paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`
}

export function learnParagraphUserPrompt(learning: LearningLanguage): string {
  const lang = learnLanguageName(learning)
  return `Pick a random subject from this list, then pick a specific topic within that subject entirely on your own. Write a single paragraph of 75–100 words about it.

Subjects:
- Physics
- Mathematics
- Philosophy
- Psychology
- History
- Linguistics
- Biology
- Neuroscience
- Economics
- Astronomy
- Anthropology
- Logic

Do not always pick the same subject or the same kinds of topics. Vary widely across runs.

Write in plain, engaging prose. No bullet points in the paragraph. Assume the reader is intelligent but not an expert. End on something that makes them want to know more.

Write the entire paragraph in ${lang}.

Return only the ${lang} paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`
}
