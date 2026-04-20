import { formatSubstringChunkRulesForPrompt } from "@/config/chunk-group-hints"
import {
  getStoredLanguageLearningPreferences,
  LEARNING_LANGUAGE_LABEL,
  type LearningLanguage,
} from "@/lib/language-learning-preferences"

const CHUNK_SORT_PREFIX_SPANISH = `Sort following spanish text into logical chunks.

Chunks should consist of a singular word or multiple words ONLY IF they  fall into any of the following categories.

fixed_idioms: e.g. dar su brazo a torcer, a punto de
relative_subordinating_connectors: e.g. mientras que
lo_nominalizer: e.g. lo maravilloso
prepositional_verb_phrases: e.g. darse cuenta de que
possessive_pronouns: e.g. el suyo
proper_nouns: e.g. Buenos Aires, 
clitic_clusters: e.g. se lo
reciprocal/distributive_pronoun_phrase: e.g. unos a otros
adverbial_phrases: e.g. por supuesto
colloquial_fixed_expressions: e.g. pinta bien
ETC.

For EACH word in context, ask, can this word be SINGULAR (Best) Or IS IT ABSOLUTELY NECESSARY to GROUP with its NEIGHBOR?

FORMAT: {"c": exact source substring, "m": English meaning, "l": literal rendering (even if unnatural), "n": tricky grammar help: omit if obvious}

Reply with only a JSON array of those objects (no markdown fences, no explanation). First character must be "[".

`

const CHUNK_SORT_PREFIX_FRENCH = `Sort the following French text into logical chunks.

Chunks should consist of a singular word or multiple words ONLY IF they fall into any of the following categories.

fixed_idioms: e.g. avoir du mal à, à point nommé
relative_subordinating_connectors: e.g. tandis que, dont
le_nominalizer: e.g. le beau, ce qui est important
prepositional_verb_phrases: e.g. se rendre compte de, tenir à
possessive_pronouns: e.g. le sien, la leur
proper_nouns: e.g. Paris, Prix Nobel
clitic_clusters: e.g. me le, lui en, le lui
reciprocal/distributive_pronoun_phrase: e.g. les uns les autres
adverbial_phrases: e.g. bien sûr, tout à coup
contracted_prepositions: e.g. du, au, auxquels
colloquial_fixed_expressions: e.g. ça marche, c'est parti
ETC.

For EACH word in context, ask: can this word stand SINGULAR (Best) — or is it ABSOLUTELY NECESSARY to GROUP it with its NEIGHBOR?

FORMAT: {"c": exact source substring, "m": English meaning, "l": literal rendering (even if unnatural), "n": tricky grammar help — omit if obvious}

Reply with only a JSON array of those objects (no markdown fences, no explanation). First character must be "[".

`

/** English source text; `m` / `l` glosses in French for native French speakers learning English. */
const CHUNK_SORT_PREFIX_ENGLISH_FOR_FRENCH_NATIVE = `Sort the following English text into logical chunks.

Chunks should consist of a singular word or multiple words ONLY IF they fall into any of the following categories.

fixed_idioms: e.g. to give up, to look forward to, by and large
phrasal_verbs: e.g. put up with, give in, carry on
relative_subordinating_connectors: e.g. as long as, so that, even though
prepositional_verb_phrases: e.g. to rely on, to deal with, to insist on
possessive_pronouns: e.g. his own, the latter's
proper_nouns: e.g. New York, Nobel Prize
modal_verb_clusters: e.g. might have been, should have done, could have gone
auxiliary_clusters: e.g. has been, will have, is being
reciprocal/distributive_pronoun_phrase: e.g. each other, one another
adverbial_phrases: e.g. all of a sudden, on the other hand, for good
colloquial_fixed_expressions: e.g. no wonder, fair enough, that said
compound_nouns: e.g. air conditioning, self-esteem, birth rate

ETC.

For EACH word in context, ask: can this word stand SINGULAR (Best) — or is it ABSOLUTELY NECESSARY to GROUP it with its NEIGHBOR?

FORMAT: {"c": exact source substring, "m": French meaning, "l": literal rendering in French (even if unnatural), "n": tricky grammar help — omit if obvious}

Reply with only a JSON array of those objects (no markdown fences, no explanation). First character must be "[".

`

/** Same English chunking rules as French-native variant; glosses in Spanish. */
const CHUNK_SORT_PREFIX_ENGLISH_FOR_SPANISH_NATIVE = `Sort the following English text into logical chunks.

Chunks should consist of a singular word or multiple words ONLY IF they fall into any of the following categories.

fixed_idioms: e.g. to give up, to look forward to, by and large
phrasal_verbs: e.g. put up with, give in, carry on
relative_subordinating_connectors: e.g. as long as, so that, even though
prepositional_verb_phrases: e.g. to rely on, to deal with, to insist on
possessive_pronouns: e.g. his own, the latter's
proper_nouns: e.g. New York, Nobel Prize
modal_verb_clusters: e.g. might have been, should have done, could have gone
auxiliary_clusters: e.g. has been, will have, is being
reciprocal/distributive_pronoun_phrase: e.g. each other, one another
adverbial_phrases: e.g. all of a sudden, on the other hand, for good
colloquial_fixed_expressions: e.g. no wonder, fair enough, that said
compound_nouns: e.g. air conditioning, self-esteem, birth rate

ETC.

For EACH word in context, ask: can this word stand SINGULAR (Best) — or is it ABSOLUTELY NECESSARY to GROUP it with its NEIGHBOR?

FORMAT: {"c": exact source substring, "m": Spanish meaning, "l": literal rendering in Spanish (even if unnatural), "n": tricky grammar help — omit if obvious}

Reply with only a JSON array of those objects (no markdown fences, no explanation). First character must be "[".

`

function hintsSection(canonical: string): string {
  const hintsBlock = formatSubstringChunkRulesForPrompt(canonical)
  return hintsBlock ? `${hintsBlock}\n\n` : ""
}

/**
 * User message for translate chunking: rules depend on General settings (learning + native language).
 * Optional substring hints from {@link formatSubstringChunkRulesForPrompt} are appended before `TEXT:`.
 */
export function buildChunkSortUserPrompt(canonical: string): string {
  const { learning, native } = getStoredLanguageLearningPreferences()
  let prefix: string
  if (learning === "english") {
    prefix =
      native === "french"
        ? CHUNK_SORT_PREFIX_ENGLISH_FOR_FRENCH_NATIVE
        : CHUNK_SORT_PREFIX_ENGLISH_FOR_SPANISH_NATIVE
  } else if (learning === "french") {
    prefix = CHUNK_SORT_PREFIX_FRENCH
  } else {
    prefix = CHUNK_SORT_PREFIX_SPANISH
  }
  return `${prefix}${hintsSection(canonical)}TEXT:\n${canonical}`
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
