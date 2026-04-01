import { jsonrepair } from "jsonrepair"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "openai/gpt-oss-120b"

/**
 * Groq on_demand counts roughly (prompt tokens + max_tokens) against a low TPM
 * ceiling (~8k). Our PROMPT() is long; 12k max_tokens was ~13k+ “requested”
 * and always tripped TPM — unrelated to how short the user’s Spanish is.
 * 4k further reduces “requested” TPM vs 5k; if you still see 429s, wait or upgrade Groq.
 */
const TRANSLATE_MAX_COMPLETION_TOKENS = 4_096

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
    const d = detail.toLowerCase()
    const isTpm =
      d.includes("tokens per minute") ||
      d.includes("tpm") ||
      d.includes("request too large for model")
    const prefix = isTpm
      ? "Groq usage limit (tokens per minute / request size). "
      : "Rate limit reached. "
    throw new Error(
      detail
        ? `${prefix}${detail}`
        : "Rate limit reached (HTTP 429). Please wait a moment and try again.",
    )
  }
  throw new Error(detail || `HTTP ${res.status}`)
}

function parseRetryAfterMs(res: Response): number | null {
  const ra = res.headers.get("Retry-After")
  if (ra == null || !ra.trim()) return null
  const n = Number(ra.trim())
  if (Number.isFinite(n) && n > 0) return Math.min(120_000, Math.round(n * 1000))
  const t = Date.parse(ra)
  if (Number.isFinite(t)) return Math.min(120_000, Math.max(0, t - Date.now()))
  return null
}

/** One retry on 429 — helps brief RPM/TPM bursts; drains first body so the connection can be reused. */
async function fetchGroqChatCompletion(body: object, apiKey: string): Promise<Response> {
  const post = () =>
    fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

  let res = await post()
  if (res.status !== 429) return res

  await res.text().catch(() => {})
  const delay = parseRetryAfterMs(res) ?? 4_000
  await new Promise((r) => setTimeout(r, delay))
  return post()
}

const PROMPT = (input: string) => `You will break the input text into chunks so the reader can hover each one in sequence and mentally assemble the English sentence as they go — like translating in their own head, chunk by chunk.

For each chunk return:

- "chunk": the original Spanish text
- "meaning": the natural English equivalent in the context of this specific sentence
- "literal": word-for-word translation, even if unnatural
- "note": a brief grammatical explanation for non-obvious chunks — null if the chunk is straightforward

DEFAULT: Usually, words should be seperated individually, or in the smallest logical group. Only group when the words make more sense together.

Here are examples of specific groups of words it makes sense to chunk:

Fixed idioms — meaning unguessable from parts:
dar su brazo a torcer, visto bueno, los unos de los otros, en cambio, del mismo modo, de este modo, se trata de, más adelante, por encima, de pronto, di cuenta, a fines de

Relative/subordinating connectors — splitting produces nonsense:
en la que, los que, antes que, de que, mientras que

Compound nouns — two words naming one thing:
redes sociales, estado natal, aspecto físico

Special grammar constructions — pattern must be read as a unit:
lo maravilloso (lo + adj = nominalizer), así mismo (fixed adverb)

Prepositional verb phrases — verb + preposition are inseparable:
contar con, darse cuenta de, pensar en, cuenta con 

Proper nouns — always one chunk, never split:
Héctor Bonilla, Ciudad de México, Estados Unidos

Clitic clusters — se la habían vendido → se la | habían | vendido | unos | piratas
"se la" = to him, her — group co-occurring clitics as one chunk, verb stays separate

]

Return only a valid JSON array, no preamble, no markdown fences.
Every word in the input must appear in the output. Do not stop early — complete the full array and close it with ].

Examples:

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

function normalizeRawChunk(raw: RawChunk): RawChunk {
  const chunk =
    typeof raw.chunk === "string" ? raw.chunk : raw.chunk != null ? String(raw.chunk) : ""
  const meaning =
    typeof raw.meaning === "string" ? raw.meaning : raw.meaning != null ? String(raw.meaning) : ""
  return { ...raw, chunk, meaning }
}

function reconcileChunks(
  chunks: RawChunk[],
  originalText: string
): ReconciledItem[] {
  const result: ReconciledItem[] = []
  let pos = 0

  for (const raw of chunks) {
    if (raw == null || typeof raw !== "object") continue
    const chunk = normalizeRawChunk(raw as RawChunk)
    if (!chunk.chunk) continue

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
      pendingBetween += item.text ?? ""
      continue
    }
    const span = typeof item.chunk === "string" ? item.chunk : String(item.chunk ?? "")
    const chunkData = {
      id: chunkId++,
      text: pendingBetween + span,
      meaning: typeof item.meaning === "string" ? item.meaning : String(item.meaning ?? ""),
      literal: item.literal,
      grammar: item.note,
    }
    pendingBetween = ""
    currentChunks.push(chunkData)
    const endsSentence = /[.!?]$/.test(span.trim())
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
 * ~68 mobile / ~115 desktop — tuned to keep mobile article pages on-screen.
 */
export const PAGE_SIZE_WORDS_MOBILE = 68
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
 * Break one long segment into smaller parts so no single unit can exceed page limits.
 * This prevents mobile overflow when a Wikipedia intro contains one very long sentence.
 */
export function splitSegmentIntoPageParts(text: string, limits: PageSplitLimits): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (!cleaned) return []

  const parts: string[] = []
  let run = ""
  let runWords = 0
  let runChars = 0

  // Prefer punctuation-aware chunks first; fallback to words if still too large.
  const punctuationChunks = cleaned
    .split(/(?<=[,;:])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)

  const tokenStream =
    punctuationChunks.length > 1
      ? punctuationChunks
      : cleaned.split(/\s+/u).filter(Boolean)

  for (const token of tokenStream) {
    const tokenWords = countWordsInSentence(token)
    const tokenChars = token.length
    const sep = run ? 1 : 0
    const nextWords = runWords + tokenWords
    const nextChars = runChars + sep + tokenChars

    if (run && (nextWords > limits.maxWords || nextChars > limits.maxChars)) {
      parts.push(run)
      run = ""
      runWords = 0
      runChars = 0
    }

    if (!run && (tokenWords > limits.maxWords || tokenChars > limits.maxChars)) {
      // Last-resort split by words.
      const words = token.split(/\s+/u).filter(Boolean)
      let wordRun = ""
      let wordRunWords = 0
      let wordRunChars = 0
      for (const w of words) {
        const wWords = countWordsInSentence(w)
        const wChars = w.length
        const wSep = wordRun ? 1 : 0
        if (
          wordRun &&
          (wordRunWords + wWords > limits.maxWords || wordRunChars + wSep + wChars > limits.maxChars)
        ) {
          parts.push(wordRun)
          wordRun = ""
          wordRunWords = 0
          wordRunChars = 0
        }
        wordRun += (wordRun ? " " : "") + w
        wordRunWords += wWords
        wordRunChars += wChars + (wordRunChars > 0 ? 1 : 0)
      }
      if (wordRun) parts.push(wordRun)
      continue
    }

    run += (run ? " " : "") + token
    runWords += tokenWords
    runChars += tokenChars + (runChars > 0 ? 1 : 0)
  }

  if (run) parts.push(run)
  return parts
}

/**
 * Group source text into pages; sentences may be split into smaller pieces if needed.
 */
export function buildSentencePages(sentences: string[], limits: PageSplitLimits): string[][] {
  if (sentences.length === 0) return []
  const { maxWords: PAGE_SIZE_WORDS, maxChars: PAGE_SIZE_CHARS } = limits
  const pieces: string[] = []
  for (const sent of sentences) {
    pieces.push(...splitSegmentIntoPageParts(sent, limits))
  }

  const pages: string[][] = []
  let cur: string[] = []
  let words = 0
  let chars = 0

  for (const sent of pieces) {
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
  const res = await fetchGroqChatCompletion(
    {
      model: MODEL,
      messages: [{ role: "user", content: PROMPT(input) }],
      temperature: 0,
      max_tokens: TRANSLATE_MAX_COMPLETION_TOKENS,
    },
    apiKey,
  )

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

export async function generateRandomSpanish(apiKey: string): Promise<string> {
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
          content: `Write one short paragraph in natural Spanish (about 3–5 sentences).

You choose the topic, setting, tone, and register freely — fiction, opinion, dialogue, description, anything. Be creative and make each response feel different when asked again.

Use idiomatic Spanish. Return only the Spanish paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`,
        },
      ],
      temperature: 1.5,
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
