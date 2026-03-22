import { jsonrepair } from "jsonrepair"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "llama-3.1-8b-instant"

async function parseGroqJsonErrorBody(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string }; message?: string }
    return j?.error?.message ?? j?.message ?? ""
  } catch {
    return ""
  }
}

function throwGroqChatHttpError(res: Response, detail: string): never {
  if (res.status === 429) {
    throw new Error(
      detail
        ? `Rate limit reached: ${detail}`
        : "Rate limit reached (HTTP 429). Please wait a moment and try again.",
    )
  }
  throw new Error(detail || `HTTP ${res.status}`)
}

const PROMPT = (input: string) => `You are a Spanish language expert helping an English speaker understand Spanish text deeply.

You will break the input text into chunks so the reader can hover each one in sequence and mentally assemble the English sentence as they go — like translating in their own head, chunk by chunk.

For each chunk return:
- "chunk": the original Spanish text
- "meaning": the natural English equivalent in the context of this specific sentence
- "literal": word-for-word translation, even if unnatural
- "note": a brief grammatical explanation for non-obvious chunks — null if the chunk is straightforward

DEFAULT: Usually, words should be seperated individually, or in the smallest logical group. Only group when the words make more sense together.

Study these examples carefully and match this behavior exactly:

INPUT: "El siempre cerraba la puerta, como hacía siempre que la llamaba."
OUTPUT: [
  { "chunk": "El", "meaning": "He", "literal": "He", "note": null },
  { "chunk": "siempre", "meaning": "always", "literal": "always", "note": null },
  { "chunk": "cerraba", "meaning": "closed", "literal": "closed", "note": null },
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "puerta", "meaning": "door", "literal": "door", "note": null },
  { "chunk": ",", "meaning": ",", "literal": ",", "note": null },
  { "chunk": "como", "meaning": "as", "literal": "as", "note": null },
  { "chunk": "hacía", "meaning": "he always did", "literal": "did", "note": null },
  { "chunk": "siempre", "meaning": "whenever", "literal": "always", "note": null },
  { "chunk": "que", "meaning": "that", "literal": "that", "note": null },
  { "chunk": "la", "meaning": "[to] her", "literal": "the", "note": null },
  { "chunk": "llamaba", "meaning": "[he] called", "literal": "called", "note": null }
]
- note: wrap any English word in [] if it has no corresponding Spanish word in the chunk. Whether that's an implied pronoun, a preposition absorbed into context, or a grammatical particle that just doesn't exist in Spanish.

INPUT: "bajo pena de perjurio ante el Senado"
OUTPUT: [
  { "chunk": "bajo", "meaning": "under", "literal": "under", "note": null },
  { "chunk": "pena", "meaning": "penalty", "literal": "penalty", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "perjurio", "meaning": "perjury", "literal": "perjury", "note": null },
  { "chunk": "ante", "meaning": "before", "literal": "before", "note": null },
  { "chunk": "el", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "Senado", "meaning": "Senate", "literal": "Senate", "note": null }
]

INPUT: "Wendy se ha enfrentado a una campaña publicitaria"
OUTPUT: [
  { "chunk": "Wendy", "meaning": "Wendy", "literal": "Wendy", "note": "person's name" },
  { "chunk": "se", "meaning": "herself", "literal": "herself", "note": "Reflexive pronoun — indicates the subject is acting on herself." },
  { "chunk": "ha", "meaning": "has", "literal": "has", "note": null },
  { "chunk": "enfrentado", "meaning": "faced", "literal": "confronted", "note": null },
  { "chunk": "a", "meaning": "to", "literal": "to", "note": null },
  { "chunk": "una", "meaning": "a", "literal": "a", "note": null },
  { "chunk": "campaña publicitaria", "meaning": "advertising campaign", "literal": "publicity campaign", "note": null }
]

INPUT: "en las redes sociales el jueves"
OUTPUT: [
  { "chunk": "en", "meaning": "on", "literal": "in", "note": "\"en\" means \"on\" here, not \"in\" — context of social media changes the preposition." },
  { "chunk": "las", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "redes sociales", "meaning": "social media", "literal": "social networks", "note": null },
  { "chunk": "el jueves", "meaning": "on Thursday", "literal": "the Thursday", "note": "\"el\" before a day of the week means \"on\" in English, not \"the\"." }
]

INPUT: "era poco probable que"
OUTPUT: [
  { "chunk": "era", "meaning": "was", "literal": "was", "note": null },
  { "chunk": "poco probable que", "meaning": "unlikely that", "literal": "little probable that", "note": null }
]

INPUT: "dar su brazo a torcer"
OUTPUT: [
  { "chunk": "dar su brazo a torcer", "meaning": "to give in", "literal": "to give its arm to twist", "note": null },
]

INPUT: "Nos vamos campeones"
OUTPUT: [
  { "chunk": "Nos vamos", "meaning": "we're leaving", "literal": "we are leaving", "note": null },
  { "chunk": "campeones", "meaning": "[as] champions", "literal": "champions", "note": null }
]
note: wrap any English word in [] if it has no corresponding Spanish word in the chunk. Whether that's an implied pronoun, a preposition absorbed into context, or a grammatical particle that just doesn't exist in Spanish.

INPUT: "insistiera"
OUTPUT: [
  { "chunk": "insistiera", "meaning": "would insist", "literal": "would insist", "note": null }
]

INPUT: "no debe"
OUTPUT: [
  { "chunk": "no debe", "meaning": "should not", "literal": "should not", "note": null }
]

INPUT: "antes que encontrarse"
OUTPUT: [
  { "chunk": "antes que", "meaning": "before", "literal": "before", "note": null },
  { "chunk": "encontrarse", "meaning": "finding oneself", "literal": "to meet", "note": null }
]

INPUT: "su estado natal en cambio"
OUTPUT: [
  { "chunk": "su", "meaning": "her", "literal": "her", "note": null },
  { "chunk": "estado natal", "meaning": "home state", "literal": "native state", "note": null },
  { "chunk": "en cambio", "meaning": "on the other hand", "literal": "in change", "note": "Fixed expression — the individual words do not hint at this meaning." }
]

INPUT: "la casa en la que vivía"
OUTPUT: [
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "casa", "meaning": "house", "literal": "house", "note": null },
  { "chunk": "en la que", "meaning": "in which", "literal": "in the that", "note": "Relative clause connector — must be grouped, splitting produces nonsense." },
  { "chunk": "vivía", "meaning": "she lived", "literal": "was living", "note": null }
]

INPUT: "No se trata de respirar y trabajar"
OUTPUT: [
  { "chunk": "No", "meaning": "(It isn't)", "literal": "No", "note": null },
  { "chunk": "se trata de", "meaning": "about", "literal": "it treats itself of", "note": null },
  { "chunk": "respirar", "meaning": "breathing", "literal": "to breathe", "note": null },
  { "chunk": "y", "meaning": "and", "literal": "and", "note": null },
  { "chunk": "trabajar", "meaning": "working", "literal": "to work", "note": null }
]

INPUT: "para estar agradecidos por lo maravilloso que es la vida"
OUTPUT: [
  { "chunk": "para", "meaning": "in order to", "literal": "for", "note": null },
  { "chunk": "estar", "meaning": "be", "literal": "to be", "note": null },
  { "chunk": "agradecidos", "meaning": "grateful", "literal": "grateful", "note": null },
  { "chunk": "por", "meaning": "for", "literal": "for", "note": null },
  { "chunk": "lo maravilloso", "meaning": "how wonderful", "literal": "the wonderful", "note": "\"lo\" before an adjective followed by \"que\" means \"how\" — \"lo maravilloso que es\" = \"how wonderful it is\"." },
  { "chunk": "que", "meaning": "(that)", "literal": "that", "note": null },
  { "chunk": "es", "meaning": "is", "literal": "is", "note": null },
  { "chunk": "la", "meaning": "(in)", "literal": "the", "note": null },
  { "chunk": "vida", "meaning": "life", "literal": "life", "note": null }
]

INPUT: "así mismo como tuve mis bajas"
OUTPUT: [
  { "chunk": "así mismo", "meaning": "likewise", "literal": "thus same", "note": "Fixed expression — must be grouped. Means \"likewise\" or \"also\"." },
  { "chunk": "como", "meaning": "as", "literal": "as", "note": null },
  { "chunk": "tuve", "meaning": "I had", "literal": "I had", "note": null },
  { "chunk": "mis", "meaning": "my", "literal": "my", "note": null },
  { "chunk": "bajas", "meaning": "lows", "literal": "lows", "note": null }
]

INPUT: "lo que"
OUTPUT: [
  { "chunk": "lo que", "meaning": "what", "literal": "what", "note": null }
]

INPUT: "había dado su visto bueno a una serie de declaraciones"
OUTPUT: [
  { "chunk": "había", "meaning": "had", "literal": "had", "note": null },
  { "chunk": "dado", "meaning": "given", "literal": "given", "note": null },
  { "chunk": "su", "meaning": "his", "literal": "his", "note": null },
  { "chunk": "visto bueno", "meaning": "approval", "literal": "good sight", "note": "Fixed expression — neither word alone suggests \"approval\"." },
  { "chunk": "a", "meaning": "to", "literal": "to", "note": null },
  { "chunk": "una", "meaning": "a", "literal": "a", "note": null },
  { "chunk": "serie", "meaning": "series", "literal": "series", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "declaraciones", "meaning": "statements", "literal": "declarations", "note": null }
]

INPUT: "el miércoles dijo"
OUTPUT: [
  { "chunk": "el miércoles", "meaning": "on Wednesday", "literal": "the Wednesday", "note": "\"el\" before a day of the week means \"on\" in English, not \"the\"." },
  { "chunk": "dijo", "meaning": "he said", "literal": "said", "note": null }
]

INPUT: "obsesionados con mejorar su aspecto físico"
OUTPUT: [
  { "chunk": "obsesionados", "meaning": "obsessed", "literal": "obsessed", "note": null },
  { "chunk": "con", "meaning": "with", "literal": "with", "note": null },
  { "chunk": "mejorar", "meaning": "improving", "literal": "to improve", "note": null },
  { "chunk": "su", "meaning": "their", "literal": "their", "note": null },
  { "chunk": "aspecto físico", "meaning": "appearance", "literal": "aspect physical", "note": null },
]

INPUT: "la técnica de golpearse la cara"
OUTPUT: [
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "técnica", "meaning": "technique", "literal": "technique", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "golpearse", "meaning": "hitting oneself", "literal": "to hit oneself", "note": "Reflexive verb — \"se\" is attached to the infinitive, indicating the action is done to oneself." },
  { "chunk": "la", "meaning": "(in) the", "literal": "the", "note": null },
  { "chunk": "cara", "meaning": "face", "literal": "face", "note": null }
]

INPUT: "durante varias semanas del mismo modo"
OUTPUT: [
  { "chunk": "durante", "meaning": "for", "literal": "during", "note": null },
  { "chunk": "varias", "meaning": "several", "literal": "various", "note": null },
  { "chunk": "semanas", "meaning": "weeks", "literal": "weeks", "note": null },
  { "chunk": "del mismo modo", "meaning": "in the same way", "literal": "of the same mode", "note": "Fixed expression — must be grouped, the words together form a set phrase." }
]

INPUT: "se le conoce como"
OUTPUT: [
  { "chunk": "se le conoce", "meaning": "it is known", "literal": "itself it knows", "note": "Impersonal construction — neither \"se\" nor \"le\" carry their usual meaning here. Together they make the verb passive." },
  { "chunk": "como", "meaning": "as", "literal": "as", "note": null }
]

INPUT: "apoyo que me dieron"
OUTPUT: [
  { "chunk": "apoyo", "meaning": "support", "literal": "support", "note": null },
  { "chunk": "que", "meaning": "that", "literal": "that", "note": null },
  { "chunk": "me", "meaning": "(to) me", "literal": "me", "note": null },
  { "chunk": "dieron", "meaning": "(you all) gave", "literal": "gave", "note": null }
]

  INPUT: "para dejar a los miembros de la generación Z en gran medida apartados los unos de los otros, temerosos y solos"
OUTPUT: [
  { "chunk": "para", "meaning": "to", "literal": "for", "note": null },
  { "chunk": "dejar", "meaning": "leave", "literal": "to leave", "note": null },
  { "chunk": "a", "meaning": "", "literal": "to", "note": "Personal \"a\" — a grammatical marker used before human direct objects in Spanish. It has no English equivalent and is not translated." },
  { "chunk": "los", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "miembros", "meaning": "members", "literal": "members", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "generación Z", "meaning": "Generation Z", "literal": "Generation Z", "note": null },
  { "chunk": "en gran medida", "meaning": "largely", "literal": "in great measure", "note": "Fixed expression — must be grouped." },
  { "chunk": "apartados", "meaning": "isolated", "literal": "separated", "note": null },
  { "chunk": "los unos de los otros", "meaning": "from each other", "literal": "the ones from the others", "note": "Fixed expression — must be grouped. Individual words give no hint of the meaning \"each other\"." },
  { "chunk": "temerosos", "meaning": "fearful", "literal": "fearful", "note": null },
  { "chunk": "y", "meaning": "and", "literal": "and", "note": null },
  { "chunk": "solos", "meaning": "alone", "literal": "alone", "note": null }
]

Return only a valid JSON array, no preamble, no markdown fences.
Every word in the input must appear in the output. Do not stop early — complete the full array and close it with ].

Text: "${input}"`

export type RawChunk = {
  chunk: string
  meaning: string
  literal?: string
  note?: string
}

export type ReconciledChunk = {
  type: "chunk"
  chunk: string
  meaning: string
  literal?: string
  note?: string
}

export type ReconciledText = {
  type: "text"
  text: string
}

export type ReconciledItem = ReconciledChunk | ReconciledText

/**
 * If reconcile ever yields two chunks in a row with no `type: "text"` between them,
 * insert a space when both sides look like word characters (avoids "palabrapalabra" glitches).
 */
export function gapBetweenReconciledChunks(
  prev: ReconciledChunk,
  next: ReconciledChunk,
): string {
  const a = prev.chunk
  const b = next.chunk
  if (/\s$/.test(a) || /^\s/.test(b)) return ""
  const word = /[\w\u00C0-\u024F]/
  if (word.test(a.slice(-1)) && word.test(b.charAt(0))) return " "
  return ""
}

function reconcileChunks(
  chunks: RawChunk[],
  originalText: string
): ReconciledItem[] {
  const result: ReconciledItem[] = []
  let pos = 0

  for (const chunk of chunks) {
    const idx = originalText.indexOf(chunk.chunk, pos)
    if (idx === -1) {
      result.push({ type: "chunk", ...chunk })
      continue
    }
    if (idx > pos) {
      result.push({ type: "text", text: originalText.slice(pos, idx) })
    }
    result.push({ type: "chunk", ...chunk })
    pos = idx + chunk.chunk.length
  }

  if (pos < originalText.length) {
    result.push({ type: "text", text: originalText.slice(pos) })
  }

  return result
}

export function splitIntoSentences(items: ReconciledItem[]) {
  const sentences: { id: number; chunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }> }[] = []
  let currentChunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }> = []
  let chunkId = 0
  /** Spaces / punctuation between chunks live in `type: "text"` items — must merge into chunk text or read mode glues words together */
  let pendingBetween = ""

  for (const item of items) {
    if (item.type === "text") {
      pendingBetween += item.text
      continue
    }
    const chunkData = {
      id: chunkId++,
      text: pendingBetween + item.chunk,
      meaning: item.meaning,
      literal: item.literal,
      grammar: item.note,
    }
    pendingBetween = ""
    currentChunks.push(chunkData)
    const endsSentence = /[.!?]$/.test(item.chunk.trim())
    if (endsSentence && currentChunks.length > 0) {
      sentences.push({ id: sentences.length, chunks: currentChunks })
      currentChunks = []
    }
  }
  if (pendingBetween && currentChunks.length > 0) {
    const last = currentChunks[currentChunks.length - 1]!
    last.text += pendingBetween
  }
  if (currentChunks.length > 0) {
    sentences.push({ id: sentences.length, chunks: currentChunks })
  }
  return sentences
}

/**
 * Words per LLM request (Article pagination + Read-mode preloads both use this; Read UI is still sentence-by-sentence).
 * ~60 mobile / ~115 desktop — one article “screen” without scroll.
 */
export const PAGE_SIZE_WORDS_MOBILE = 60
export const PAGE_SIZE_WORDS_DESKTOP = 115

export type PageSplitLimits = {
  maxWords: number
  maxChars: number
}

/** Secondary cap (chars) so one very long sentence doesn’t dominate a page. */
export function pageCharCapForWordLimit(maxWords: number): number {
  return Math.round(maxWords * 24)
}

export function resolvePageSplitLimits(isMobileViewport: boolean): PageSplitLimits {
  const maxWords = isMobileViewport ? PAGE_SIZE_WORDS_MOBILE : PAGE_SIZE_WORDS_DESKTOP
  return { maxWords, maxChars: pageCharCapForWordLimit(maxWords) }
}

function countWordsInSentence(s: string): number {
  return s.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length
}

/**
 * Split source Spanish into sentences without cutting mid-sentence.
 * Uses `Intl.Segmenter` when available (es).
 */
export function splitSourceIntoSentences(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  try {
    const Seg = (
      Intl as unknown as {
        Segmenter?: new (locales: string, options: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> }
      }
    ).Segmenter
    if (Seg) {
      const seg = new Seg("es", { granularity: "sentence" })
      return [...seg.segment(t)]
        .map((x) => x.segment.trim())
        .filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  return t
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Group sentences into pages; each page is `string[]` (full sentences only).
 */
export function buildSentencePages(sentences: string[], limits: PageSplitLimits): string[][] {
  if (sentences.length === 0) return []
  const { maxWords: PAGE_SIZE_WORDS, maxChars: PAGE_SIZE_CHARS } = limits
  const pages: string[][] = []
  let cur: string[] = []
  let words = 0
  let chars = 0

  for (const sent of sentences) {
    const w = countWordsInSentence(sent)
    const c = sent.length
    const sep = cur.length > 0 ? 1 : 0
    if (
      cur.length > 0 &&
      (words + w > PAGE_SIZE_WORDS || chars + sep + c > PAGE_SIZE_CHARS)
    ) {
      pages.push(cur)
      cur = []
      words = 0
      chars = 0
    }
    cur.push(sent)
    words += w
    chars += c + sep
  }
  if (cur.length) pages.push(cur)
  return pages
}

export function pageSourceText(pageSentences: string[]): string {
  return pageSentences.join(" ")
}

/** Single LLM call: chunk JSON → reconciled items for one page of source text. */
export async function translatePageText(
  input: string,
  apiKey: string,
): Promise<ReconciledItem[]> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: PROMPT(input) }],
      temperature: 0.2,
      max_tokens: 16000,
    }),
  })

  if (!res.ok) {
    const detail = await parseGroqJsonErrorBody(res)
    throwGroqChatHttpError(res, detail)
  }

  const data = await res.json()
  let raw = data.choices?.[0]?.message?.content?.trim() ?? ""

  raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim()

  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("No JSON array found in response")

  const repaired = jsonrepair(match[0])
  const parsed: RawChunk[] = JSON.parse(repaired)
  return reconcileChunks(parsed, input)
}

export type PageSentenceRange = { pageIndex: number; start: number; end: number }

export type ReadSentence = {
  id: number
  /** Which LLM / article page this step came from (preload ranges use this). */
  sourcePageIndex: number
  chunks: Array<{
    id: number
    text: string
    meaning: string
    literal?: string
    grammar?: string
  }>
}

/**
 * Max words per Read-mode step on narrow viewports — same prev/next as desktop, smaller bites.
 * (LLM still uses PAGE_SIZE_WORDS_MOBILE per request; this only splits display steps.)
 */
export const READ_MODE_WORDS_PER_STEP_MOBILE = 18

function countWordsInText(s: string): number {
  return s.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length
}

/** Concatenate translated pages into one Read-mode sentence list (stable chunk ids). */
export function mergeReconciledPagesToSentences(
  pages: ReconciledItem[][],
): ReadSentence[] {
  const out: ReadSentence[] = []
  let chunkId = 0
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const reconciled = pages[pageIndex]!
    const sents = splitIntoSentences(reconciled)
    for (const s of sents) {
      out.push({
        id: out.length,
        sourcePageIndex: pageIndex,
        chunks: s.chunks.map((c) => ({ ...c, id: chunkId++ })),
      })
    }
  }
  return out.map((s, i) => ({ ...s, id: i }))
}

/**
 * Split long read steps at chunk boundaries so each step stays under `maxWords` (mobile).
 * Single chunks that alone exceed the budget stay as one step.
 */
export function subdivideReadStepsForMobile(
  sentences: ReadSentence[],
  maxWordsPerStep: number,
): ReadSentence[] {
  const out: ReadSentence[] = []
  let nextId = 0
  let chunkId = 0

  for (const sent of sentences) {
    const chunks = sent.chunks
    const totalWords = chunks.reduce((sum, c) => sum + countWordsInText(c.text), 0)
    if (totalWords <= maxWordsPerStep || chunks.length === 0) {
      out.push({
        id: nextId++,
        sourcePageIndex: sent.sourcePageIndex,
        chunks: chunks.map((c) => ({ ...c, id: chunkId++ })),
      })
      continue
    }

    let run: ReadSentence["chunks"] = []
    let runWords = 0
    for (const c of chunks) {
      const w = countWordsInText(c.text)
      if (run.length > 0 && runWords + w > maxWordsPerStep) {
        out.push({
          id: nextId++,
          sourcePageIndex: sent.sourcePageIndex,
          chunks: run.map((x) => ({ ...x, id: chunkId++ })),
        })
        run = []
        runWords = 0
      }
      run.push(c)
      runWords += w
    }
    if (run.length > 0) {
      out.push({
        id: nextId++,
        sourcePageIndex: sent.sourcePageIndex,
        chunks: run.map((x) => ({ ...x, id: chunkId++ })),
      })
    }
  }
  return out
}

/** Preload ranges in *display step* indices, after any mobile subdivision. */
export function pageStepRangesFromSentences(sentences: ReadSentence[]): PageSentenceRange[] {
  if (sentences.length === 0) return []
  const maxPage = Math.max(...sentences.map((s) => s.sourcePageIndex))
  const ranges: PageSentenceRange[] = []
  for (let p = 0; p <= maxPage; p++) {
    const idxs: number[] = []
    sentences.forEach((s, i) => {
      if (s.sourcePageIndex === p) idxs.push(i)
    })
    if (idxs.length === 0) continue
    const start = Math.min(...idxs)
    const end = Math.max(...idxs) + 1
    ranges.push({ pageIndex: p, start, end })
  }
  return ranges
}

export function sentenceCountsPerReconciledPage(
  reconciledPages: ReconciledItem[][],
): number[] {
  return reconciledPages.map((r) => splitIntoSentences(r).length)
}

export function cumulativePageSentenceRanges(counts: number[]): PageSentenceRange[] {
  let offset = 0
  return counts.map((n, pageIndex) => {
    const start = offset
    offset += n
    return { pageIndex, start, end: offset }
  })
}

/** How many pages starting from 0 are successfully loaded (stops at first gap). */
export function countConsecutiveLoadedPages(
  getPage: (i: number) => ReconciledItem[] | null,
  totalPages: number,
): number {
  let n = 0
  for (let i = 0; i < totalPages; i++) {
    if (getPage(i) != null) n++
    else break
  }
  return n
}

export async function translate(
  input: string,
  apiKey: string,
): Promise<{ reconciled: ReconciledItem[]; sentences: ReturnType<typeof splitIntoSentences> }> {
  const reconciled = await translatePageText(input, apiKey)
  const sentences = splitIntoSentences(reconciled)
  return { reconciled, sentences }
}

const RANDOM_STYLES = [
  "a WhatsApp message from a worried mother",
  "the opening lines of a novel set in Seville",
  "a teenager's diary entry",
  "a letter from someone who just moved cities",
  "overheard conversation on a Madrid metro",
  "a food critic reviewing a tiny restaurant",
  "a text message argument between siblings",
  "a fisherman describing the sea at dawn",
  "a grandmother's recipe with personal asides",
  "a man watching his neighbourhood change",
  "a child explaining something they misunderstood",
  "a heartfelt wedding toast that goes slightly off-script",
  "a lonely traveller writing in their journal",
  "a street vendor's sales pitch with hidden poetry",
  "a detective's internal monologue at a crime scene",
  "a botanist describing a plant they've just discovered",
  "two neighbours arguing over a wall",
  "a professor losing their train of thought mid-lecture",
  "a love letter that never got sent",
  "someone describing a dream that felt too real",
]

export async function generateRandomSpanish(apiKey: string): Promise<string> {
  const style = RANDOM_STYLES[Math.floor(Math.random() * RANDOM_STYLES.length)]
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `Write a short paragraph in natural Spanish (3–5 sentences) in this style or voice: ${style}.

Be creative — vary your vocabulary, rhythm, and register to match the voice. 
Use authentic Spanish expressions where they fit naturally.
Return only the Spanish text. No translation, no explanation, no quotes.`,
        },
      ],
      temperature: 1.1,
      max_tokens: 300,
    }),
  })

  if (!res.ok) {
    const detail = await parseGroqJsonErrorBody(res)
    throwGroqChatHttpError(res, detail)
  }
  const data = await res.json()
  return data.choices[0].message.content.trim()
}

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

/** Spanish-first speech-to-text via Groq Whisper (same API key as chat). */
export async function transcribeAudioWithGroq(
  apiKey: string,
  audioBlob: Blob,
  filename = "recording.webm",
): Promise<string> {
  const form = new FormData()
  form.append("file", audioBlob, filename)
  form.append("model", "whisper-large-v3-turbo")
  form.append("language", "es")
  form.append("response_format", "json")

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "")
    if (res.status === 429) {
      let detail = ""
      try {
        const j = JSON.parse(err) as { error?: { message?: string } }
        detail = j?.error?.message ?? ""
      } catch {
        /* ignore */
      }
      throw new Error(
        detail
          ? `Rate limit reached: ${detail}`
          : "Rate limit reached (HTTP 429). Please wait a moment and try again.",
      )
    }
    throw new Error(err || `Transcription failed: ${res.status}`)
  }

  const data = (await res.json()) as { text?: string }
  return (data.text ?? "").trim()
}

/** Join transcribed phrase to existing textarea value with a space when needed */
export function appendTranscriptToField(previous: string, addition: string): string {
  const add = addition.trim()
  if (!add) return previous
  const prev = previous
  if (!prev.trim()) return add
  const needsSpace = !/\s$/.test(prev) && !/^\s/.test(add)
  return prev + (needsSpace ? " " : "") + add
}
