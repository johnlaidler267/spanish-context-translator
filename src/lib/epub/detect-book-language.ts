import type { LearningLanguage } from "@/lib/storage/language-learning-preferences"

/**
 * Works out which of the app's learning languages an uploaded book is written in, so the Library
 * and Continue Reading can show only books in the language the reader is currently learning.
 *
 * The text itself is checked first, because EPUB metadata is often wrong: many tools stamp every
 * book `<dc:language>en</dc:language>` by default. Counting very common words that only one of
 * the three languages uses ("el/los/una" vs "le/les/et" vs "the/and/of") separates them reliably
 * once there are a few dozen of them, which any real book has within its first page or two.
 * The OPF's `<dc:language>` is the fallback for a text too short or mixed to call.
 *
 * supabase/migrations/0034_user_epub_language.sql runs the same word-count check in SQL to tag
 * books uploaded before this existed -- keep the word lists there in step with these.
 */

/** Only words used by just one of the three languages: shared ones ("de", "la", "que", "en",
 *  "y", "on", "a", "no") would only blur the count. */
const MARKER_WORDS: Record<LearningLanguage, readonly string[]> = {
  spanish: [
    "el", "los", "las", "una", "por", "con", "para", "del", "al", "lo", "pero", "su", "sus",
    "más", "como", "está", "muy", "es", "fue", "había", "él", "ella", "yo", "cuando", "porque",
  ],
  french: [
    "le", "les", "et", "une", "des", "du", "qui", "est", "pas", "ne", "je", "il", "elle", "nous",
    "vous", "dans", "pour", "sur", "avec", "au", "aux", "ce", "cette", "mais", "était", "très",
  ],
  english: [
    "the", "and", "of", "to", "in", "is", "it", "that", "was", "he", "she", "with", "for", "his",
    "her", "you", "i", "not", "but", "at", "be", "had", "they", "this", "would",
  ],
}

const WORD_TO_LANGUAGE = new Map<string, LearningLanguage>(
  (Object.entries(MARKER_WORDS) as [LearningLanguage, readonly string[]][]).flatMap(([lang, words]) =>
    words.map((w) => [w, lang] as const),
  ),
)

/** How much of the book to look at -- plenty to decide, without scanning a 2M-character novel. */
const SAMPLE_CHARS = 30_000
/** Below this many marker words there isn't enough text to call it. */
const MIN_MARKER_HITS = 20
/** The winner must beat the runner-up by this factor, so a bilingual text doesn't get a guess. */
const MIN_LEAD_RATIO = 1.5

/** The language `text` is written in, or null when it's too short or too mixed to tell. */
export function detectTextLanguage(text: string): LearningLanguage | null {
  const counts: Record<LearningLanguage, number> = { spanish: 0, french: 0, english: 0 }
  for (const word of text.slice(0, SAMPLE_CHARS).toLowerCase().match(/\p{L}+/gu) ?? []) {
    const lang = WORD_TO_LANGUAGE.get(word)
    if (lang) counts[lang]++
  }
  const [[best, top], [, second]] = (Object.entries(counts) as [LearningLanguage, number][]).sort(
    (a, b) => b[1] - a[1],
  )
  if (top < MIN_MARKER_HITS || top < second * MIN_LEAD_RATIO) return null
  return best
}

/** Maps an EPUB `<dc:language>` tag ("es", "es-MX", "fra", "en_US", ...) to a learning
 *  language, or null for anything else (or nothing). */
export function learningLanguageFromTag(tag: string | null | undefined): LearningLanguage | null {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0]
  if (primary === "es" || primary === "spa") return "spanish"
  if (primary === "fr" || primary === "fra" || primary === "fre") return "french"
  if (primary === "en" || primary === "eng") return "english"
  return null
}

/** Best guess for a book being uploaded: its text, then its metadata, then the language the
 *  reader is learning right now (they're presumably uploading something to read in it). */
export function detectBookLanguage(
  book: { text: string; languageTag: string | null },
  fallback: LearningLanguage,
): LearningLanguage {
  return detectTextLanguage(book.text) ?? learningLanguageFromTag(book.languageTag) ?? fallback
}
