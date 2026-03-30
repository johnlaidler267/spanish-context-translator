/**
 * Random intro extracts from Spanish Wikipedia for the landing "Learn" pill.
 * Truncates to a word budget so the first translation page stays reasonable.
 */

export const WIKIPEDIA_RANDOM_MAX_WORDS = 80

const ES_WIKI_API = "https://es.wikipedia.org/w/api.php"
const MAX_ATTEMPTS = 8

export function truncateToWordLimit(text: string, maxWords: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return normalized
  return `${words.slice(0, maxWords).join(" ")}…`
}

type WikiQueryResponse = {
  query?: { pages?: Array<{ missing?: boolean; title?: string; extract?: string }> }
}

export type SpanishWikipediaIntro = {
  /** Article title (API `title`, spaces not underscores). */
  title: string
  /** Lead paragraph text, word-truncated. */
  intro: string
}

/**
 * Fetches a random article lead section (plain text) and trims to `maxWords`.
 * Retries when the random title has no usable extract (e.g. disambiguation pages).
 */
export async function fetchRandomSpanishWikipediaIntro(
  maxWords = WIKIPEDIA_RANDOM_MAX_WORDS,
): Promise<SpanishWikipediaIntro> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const url = new URL(ES_WIKI_API)
    url.searchParams.set("action", "query")
    url.searchParams.set("format", "json")
    url.searchParams.set("formatversion", "2")
    url.searchParams.set("origin", "*")
    url.searchParams.set("generator", "random")
    url.searchParams.set("grnnamespace", "0")
    url.searchParams.set("grnlimit", "1")
    url.searchParams.set("prop", "extracts")
    url.searchParams.set("explaintext", "true")
    url.searchParams.set("exintro", "true")

    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new Error(`Wikipedia no respondió (${res.status}).`)
    }
    const data = (await res.json()) as WikiQueryResponse
    const page = data.query?.pages?.[0]
    if (!page || page.missing) continue
    const raw = page.extract?.trim()
    const title = page.title?.replace(/_/g, " ").trim()
    if (!raw || !title) continue
    const cleaned = raw.replace(/\u200b/g, "").replace(/\s+/g, " ").trim()
    const intro = truncateToWordLimit(cleaned, maxWords)
    if (intro.length > 40) return { title, intro }
  }
  throw new Error("No se pudo cargar un artículo. Inténtalo de nuevo.")
}
