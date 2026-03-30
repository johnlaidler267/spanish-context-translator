/**
 * Intro extracts from Spanish Wikipedia *featured articles* (Artículos destacados)
 * for the landing "Learn" pill — same pool editors mark as best-written / notable.
 * Truncates to a word budget so the first translation page stays reasonable.
 */

export const WIKIPEDIA_RANDOM_MAX_WORDS = 80

const ES_WIKI_API = "https://es.wikipedia.org/w/api.php"
/** Main-namespace pages in es.wiki's featured-article category (not subcategories). */
const ES_FEATURED_CATEGORY = "Categoría:Wikipedia:Artículos_destacados"
const GCM_LIMIT = "500"
const MAX_BATCHES = 4

export function truncateToWordLimit(text: string, maxWords: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return normalized
  return `${words.slice(0, maxWords).join(" ")}…`
}

type WikiPage = { missing?: boolean; title?: string; extract?: string }

type WikiQueryResponse = {
  batchcomplete?: boolean
  /** Pagination for generator=categorymembers — pass all string fields on the next request. */
  continue?: Record<string, string>
  query?: { pages?: WikiPage[] }
}

export type SpanishWikipediaIntro = {
  /** Article title (API `title`, spaces not underscores). */
  title: string
  /** Lead paragraph text, word-truncated. */
  intro: string
}

function pageToIntro(page: WikiPage | undefined, maxWords: number): SpanishWikipediaIntro | null {
  if (!page || page.missing) return null
  const raw = page.extract?.trim()
  const title = page.title?.replace(/_/g, " ").trim()
  if (!raw || !title) return null
  const cleaned = raw.replace(/\u200b/g, "").replace(/\s+/g, " ").trim()
  const intro = truncateToWordLimit(cleaned, maxWords)
  if (intro.length > 40) return { title, intro }
  return null
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function applyContinueParams(url: URL, continueParams: Record<string, string> | null) {
  if (!continueParams) return
  for (const [key, value] of Object.entries(continueParams)) {
    if (typeof value === "string") url.searchParams.set(key, value)
  }
}

async function fetchFeaturedArticleBatch(
  continueParams: Record<string, string> | null,
): Promise<{ pages: WikiPage[]; nextContinue: Record<string, string> | null }> {
  const url = new URL(ES_WIKI_API)
  url.searchParams.set("action", "query")
  url.searchParams.set("format", "json")
  url.searchParams.set("formatversion", "2")
  url.searchParams.set("origin", "*")
  url.searchParams.set("generator", "categorymembers")
  url.searchParams.set("gcmtitle", ES_FEATURED_CATEGORY)
  url.searchParams.set("gcmnamespace", "0")
  url.searchParams.set("gcmtype", "page")
  url.searchParams.set("gcmlimit", GCM_LIMIT)
  url.searchParams.set("prop", "extracts")
  url.searchParams.set("explaintext", "true")
  url.searchParams.set("exintro", "true")
  applyContinueParams(url, continueParams)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Wikipedia no respondió (${res.status}).`)
  }
  const data = (await res.json()) as WikiQueryResponse
  const pages = data.query?.pages ?? []
  const rawContinue = data.continue
  const nextContinue =
    rawContinue && typeof rawContinue === "object"
      ? (Object.fromEntries(
          Object.entries(rawContinue).filter((e): e is [string, string] => typeof e[1] === "string"),
        ) as Record<string, string>)
      : null
  return { pages, nextContinue: Object.keys(nextContinue ?? {}).length ? nextContinue : null }
}

/**
 * Fetches a random *featured* article lead (plain text) and trims to `maxWords`.
 * Uses [[Categoría:Wikipedia:Artículos destacados]] via the categorymembers API.
 */
export async function fetchRandomSpanishWikipediaIntro(
  maxWords = WIKIPEDIA_RANDOM_MAX_WORDS,
): Promise<SpanishWikipediaIntro> {
  let continueParams: Record<string, string> | null = null

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { pages, nextContinue } = await fetchFeaturedArticleBatch(continueParams)
    if (!pages.length) break

    const shuffled = shuffleInPlace([...pages])
    for (const page of shuffled) {
      const intro = pageToIntro(page, maxWords)
      if (intro) return intro
    }

    continueParams = nextContinue
    if (!continueParams) break
  }

  throw new Error("No se pudo cargar un artículo. Inténtalo de nuevo.")
}
