import { jsonrepair } from "jsonrepair"
import { postProcessChunks } from "@/lib/chunk-merges"
import {
  fetchGeminiChatViaEdge,
  fetchGroqChatViaEdge,
  transcribeAudioViaEdge,
} from "@/lib/groq-edge"

/** `groq` (default) or `gemini` — set `VITE_TRANSLATION_LLM_PROVIDER` in `.env`. */
function translationProvider(): "groq" | "gemini" {
  const v = (import.meta.env.VITE_TRANSLATION_LLM_PROVIDER as string | undefined)?.trim().toLowerCase()
  return v === "gemini" ? "gemini" : "groq"
}

const GROQ_TRANSLATE_MODEL = "llama-3.3-70b-versatile"
const GROQ_LEARN_MODEL = "llama-3.1-8b-instant" as const
/** Must match a model id from the Generative Language API (see ListModels / Gemini docs). `gemini-3.0-flash` is not valid — use e.g. `gemini-2.0-flash` or `gemini-3-flash` if your project lists it. */
const GEMINI_TRANSLATE_MODEL_DEFAULT = "gemini-2.5-flash-lite"
const GEMINI_LEARN_MODEL_DEFAULT = "gemini-2.5-flash-lite"

function translateModel(): string {
  if (translationProvider() === "gemini") {
    return (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || GEMINI_TRANSLATE_MODEL_DEFAULT
  }
  return GROQ_TRANSLATE_MODEL
}

function learnModel(): string {
  if (translationProvider() === "gemini") {
    return (import.meta.env.VITE_GEMINI_MODEL_LEARN as string | undefined)?.trim() || GEMINI_LEARN_MODEL_DEFAULT
  }
  return GROQ_LEARN_MODEL
}

/** For Settings UI — reflects `VITE_TRANSLATION_LLM_PROVIDER` and Gemini model env at build time. */
export function getTranslationLlmDisplayInfo(): {
  provider: "groq" | "gemini"
  translateModel: string
  learnModel: string
} {
  return {
    provider: translationProvider(),
    translateModel: translateModel(),
    learnModel: learnModel(),
  }
}

/**
 * GPT-OSS on Groq always spends reasoning tokens; `reasoning_effort` only changes how many.
 * To stop stream-of-consciousness in `message.content`, Groq requires `reasoning_format: "hidden"`
 * (see https://console.groq.com/docs/reasoning — "Returns only the final answer").
 */
const TRANSLATE_REASONING_EFFORT = "low" as const
const GROQ_REASONING_FORMAT_HIDDEN = "hidden" as const

/**
 * Groq on_demand counts roughly (prompt tokens + max_tokens) against a low TPM
 * ceiling (~8k). Our PROMPT() is long; 12k max_tokens was ~13k+ “requested”
 * and always tripped TPM — unrelated to how short the user’s Spanish is.
 * 4k further reduces “requested” TPM vs 5k; if you still see 429s, wait or upgrade Groq.
 */
const TRANSLATE_MAX_COMPLETION_TOKENS = 6000

/**
 * Spanish character budget for a single `translatePageText` completion.
 * {@link PageSplitLimits.maxChars} comes from viewport fill and can be several thousand; per-word
 * chunk JSON is far larger than the source, so one “screen-sized” paste must not always mean one API call.
 * Tune down if `finish_reason: length` or long plain tails persist; up slightly if article pages feel too fragmented.
 */
export const LLM_CHUNK_INPUT_CHAR_CAP = 1800

/** Clamp DOM-measured {@link PageSplitLimits} so each batch stays within {@link LLM_CHUNK_INPUT_CHAR_CAP}. */
export function clampPageLimitsForLlmBatching(limits: PageSplitLimits): PageSplitLimits {
  return {
    maxWords: limits.maxWords,
    maxChars: Math.min(limits.maxChars, LLM_CHUNK_INPUT_CHAR_CAP),
  }
}

async function parseChatJsonErrorBody(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof j?.error === "string") return j.error
    return j?.error?.message ?? j?.message ?? ""
  } catch {
    return ""
  }
}

/** Google / billing-style 429s — retrying after a few seconds does not help. */
function isHardQuotaOrBillingErrorText(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.includes("quota exceeded") ||
    t.includes("limit: 0") ||
    t.includes("free_tier") ||
    t.includes("exceeded your current quota") ||
    (t.includes("billing") && t.includes("quota"))
  )
}

/** Model id from Google quota error text, e.g. `model: gemini-2.0-flash`. */
function geminiModelFromQuotaDetail(detail: string): string | null {
  const m = detail.match(/\bmodel:\s*([^\s,*]+)/i)
  return m?.[1]?.trim() ?? null
}

function formatRateLimitUserMessage(detail: string): string {
  const d = detail.trim()
  if (!d) return "Rate limit reached (HTTP 429). Please wait a moment and try again."

  if (translationProvider() === "gemini" && isHardQuotaOrBillingErrorText(d)) {
    const model = geminiModelFromQuotaDetail(d)
    const modelBit = model ? ` (${model})` : ""
    return (
      `Google reports no usable Gemini quota for this key${modelBit} — often until billing is enabled or the project has API access. ` +
      "Details: https://ai.google.dev/gemini-api/docs/rate-limits — " +
      "or switch to Groq by removing or unsetting VITE_TRANSLATION_LLM_PROVIDER."
    )
  }

  const lower = d.toLowerCase()
  const isTpm =
    lower.includes("tokens per minute") ||
    lower.includes("tpm") ||
    lower.includes("request too large for model") ||
    lower.includes("resource exhausted")
  const alreadySelfDescribing =
    lower.includes("quota exceeded") ||
    lower.includes("exceeded your current quota") ||
    /\brate limit\b/.test(lower) ||
    lower.includes("too many requests")

  if (alreadySelfDescribing) return d
  if (isTpm) return `Translation model usage limit (tokens per minute / request size). ${d}`
  return `Rate limit reached. ${d}`
}

function throwChatHttpError(res: Response, detail: string): never {
  if (res.status === 429) {
    throw new Error(formatRateLimitUserMessage(detail))
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

/**
 * One retry on 429 for transient throttling only. Hard quota / billing 429s (e.g. Gemini
 * `limit: 0`) are returned immediately so we do not double-hit the API.
 */
async function fetchChatCompletion(body: object): Promise<Response> {
  const post = () =>
    translationProvider() === "gemini" ? fetchGeminiChatViaEdge(body) : fetchGroqChatViaEdge(body)

  let res = await post()
  if (res.status !== 429) return res

  const bodyText = await res.text().catch(() => "")
  if (isHardQuotaOrBillingErrorText(bodyText)) {
    return new Response(bodyText, { status: 429, headers: res.headers })
  }

  const delay = parseRetryAfterMs(res) ?? 4_000
  await new Promise((r) => setTimeout(r, delay))
  return post()
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string" && content.trim()) return content.trim()
  if (Array.isArray(content)) {
    const texts = content.map((part: unknown) => {
      if (part !== null && typeof part === "object" && "text" in part) {
        const t = (part as { text?: unknown }).text
        return typeof t === "string" ? t : ""
      }
      return ""
    })
    const joined = texts.join("")
    if (joined.trim()) return joined.trim()
  }
  return ""
}

/** Concatenate channels so a JSON array in one field isn’t lost when the other has prose. */
function combineAssistantPayloadsForChunkParse(data: unknown): string {
  const choice = (data as { choices?: Array<{ message?: Record<string, unknown> }> })?.choices?.[0]
  const msg = choice?.message
  if (!msg) return ""
  const parts: string[] = []
  const c = stringifyMessageContent(msg.content)
  if (c) parts.push(c)
  const r = msg.reasoning
  if (typeof r === "string" && r.trim()) parts.push(r.trim())
  return parts.join("\n\n")
}

function chatFinishReasonFromOpenAiStylePayload(data: unknown): string | undefined {
  const fr = (data as { choices?: Array<{ finish_reason?: string }> })?.choices?.[0]?.finish_reason
  return typeof fr === "string" ? fr : undefined
}

/**
 * Balanced `[`…`]` span starting at `start` (must be `[`); ignores `]` inside double-quoted JSON strings.
 */
function sliceBalancedJsonArrayFrom(raw: string, start: number): string | null {
  if (start < 0 || start >= raw.length || raw[start] !== "[") return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]!
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (c === "\\") {
        esc = true
        continue
      }
      if (c === '"') {
        inStr = false
        continue
      }
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === "[") depth++
    if (c === "]") {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

/** First `[`…`]` span in `raw`. */
function sliceBalancedJsonArray(raw: string): string | null {
  const start = raw.indexOf("[")
  if (start === -1) return null
  return sliceBalancedJsonArrayFrom(raw, start)
}

/** Every balanced array span (for models that prepend chain-of-thought before the real JSON). */
function allBalancedJsonArraySpans(raw: string): string[] {
  const spans: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "[") {
      const s = sliceBalancedJsonArrayFrom(raw, i)
      if (s) spans.push(s)
    }
  }
  return spans
}

/**
 * Model sometimes appends prose after the closing `]` (e.g. "Need chunking. Provide JSON array.").
 * Slice to that bracket so JSON.parse / jsonrepair see only the array.
 */
function stripTrailingChunkingBoilerplate(s: string): string {
  const t = s.trimEnd()
  const re =
    /\]\s*(?:\r?\n\s*)*(?:Need chunking|Provide\s+(?:JSON\s+)?array)[\s\S]*$/i
  const m = t.match(re)
  if (m && m.index !== undefined) return t.slice(0, m.index + 1)
  return t
}

/** First complete `[...]` only — drops trailing "Need chunking…" after a valid array. */
function stripToFirstBalancedJsonArray(raw: string): string | null {
  const t = raw.trim()
  const start = t.indexOf("[")
  if (start === -1) return null
  return sliceBalancedJsonArrayFrom(t, start)
}

/**
 * GPT-OSS often glues `,":"` where valid JSON needs `":","` when the Spanish chunk is
 * punctuation (comma, colon). Example broken: `{"c",":"m` → `{"c":",","m`
 * Without this, `]`/`"` balance is wrong and JSON.parse + jsonrepair both fail.
 */
function sanitizeChunkJsonTypos(s: string): string {
  let o = s
  for (let pass = 0; pass < 6; pass++) {
    const next = o
      .replace(/"c",":"m/g, '"c":",","m')
      .replace(/"c",":"l/g, '"c":",","l')
      .replace(/"c",":"n/g, '"c":",","n')
      .replace(/"c",",","m/g, '"c":",","m')
      .replace(/"c",",","l/g, '"c":",","l')
      .replace(/"c",",","n/g, '"c":",","n')
      .replace(/"l":":"(?=\s*[,}\]])/g, '"l":","')
      .replace(/"m":":"(?=\s*[,}\]])/g, '"m":","')
    if (next === o) break
    o = next
  }
  return o
}

function looksLikeChunkJsonKeys(s: string): boolean {
  return /"c"\s*:/.test(s) || /"chunk"\s*:/.test(s)
}

function extractChunkJsonArrayFromText(raw: string): unknown[] {
  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim()
  cleaned = stripTrailingChunkingBoilerplate(cleaned)
  cleaned = sanitizeChunkJsonTypos(cleaned)
  if (!cleaned) throw new Error("Empty model response")

  const tryParseArray = (s: string): unknown[] | null => {
    const t = sanitizeChunkJsonTypos(stripTrailingChunkingBoilerplate(s.trim()))
    if (!t) return null
    try {
      const repaired = jsonrepair(t)
      const parsed = JSON.parse(repaired)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      try {
        const parsed = JSON.parse(t)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
  }

  /**
   * jsonrepair on `[...] trailing prose` can yield `[]` or junk; whole-string parse must not
   * win before we isolate the first balanced `[...]` (which ignores text after `]`).
   */
  const acceptWholeArray = (arr: unknown[] | null, source: string): unknown[] | null => {
    if (!arr) return null
    if (arr.length > 0) return arr
    const t = source.trim()
    if (/^\[\s*\]\s*$/.test(t)) return arr
    if (looksLikeChunkJsonKeys(source)) return null
    return arr
  }

  // 1) First top-level [...] only (drops any trailing model text after `]`)
  const stripped = stripToFirstBalancedJsonArray(cleaned)
  if (stripped) {
    const arr = acceptWholeArray(tryParseArray(stripped), stripped)
    if (arr) return arr
  }

  // 2) Whole string is a JSON array (possibly with jsonrepair) — reject empty if chunks clearly present
  const whole = acceptWholeArray(tryParseArray(cleaned), cleaned)
  if (whole) return whole

  // 3) Try every balanced span, longest first (prose before first [, or bracket scanner quirks)
  const candidates = allBalancedJsonArraySpans(cleaned).sort((a, b) => b.length - a.length)
  for (const span of candidates) {
    const arr = acceptWholeArray(tryParseArray(span), span)
    if (arr && arr.length > 0) return arr
  }

  // 4) First [ … ] via indexOf
  const balanced = sliceBalancedJsonArray(cleaned)
  if (balanced) {
    const arr = acceptWholeArray(tryParseArray(balanced), balanced)
    if (arr) return arr
  }

  // 5) Greedy bracket span (last resort; can fail if `]` appears inside strings)
  const greedy = cleaned.match(/\[[\s\S]*\]/)
  if (greedy) {
    const arr = acceptWholeArray(tryParseArray(greedy[0]), greedy[0])
    if (arr) return arr
  }

  try {
    const repaired = jsonrepair(cleaned)
    const parsed = JSON.parse(repaired) as unknown
    if (Array.isArray(parsed)) {
      const ok = acceptWholeArray(parsed, cleaned)
      if (ok) return ok
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>
      for (const k of ["chunks", "output", "data", "items", "result"]) {
        const v = o[k]
        if (Array.isArray(v)) return v
      }
    }
  } catch {
    /* ignore */
  }

  const preview = cleaned.length > 400 ? `${cleaned.slice(0, 400)}…` : cleaned
  throw new Error(`No JSON array found in response. Preview: ${preview}`)
}

const PROMPT = (input: string) => `
Sort following spanish text into logical chunks.

Chunks should consist of a singular word or multiple words ONLY IF they  fall into any of the following categories.

fixed_idioms: e.g. dar su brazo a torcer
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

FORMAT: {"c": exact source substring, "m": English meaning, "l": literal rendering, "n": grammar note — omit if obvious}

TEXT:
${input}`

/** LLM JSON uses short keys (c,m,l,n); internal pipeline uses long names. */
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

/** Map LLM row (c/m/l/n or legacy chunk/meaning/literal/note) → RawChunk. */
function coerceLlmChunkRow(raw: unknown): RawChunk | null {
  if (raw == null || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const chunk = pickLlmStr(o, "c", "chunk")
  const meaning = pickLlmStr(o, "m", "meaning")
  if (chunk === undefined || meaning === undefined) return null
  const literal = pickLlmOptStr(o, "l", "literal")
  const noteRaw = pickLlmNote(o, "n", "note")
  const note = noteRaw === null ? undefined : noteRaw
  return { chunk, meaning, literal, note }
}

function pickLlmStr(o: Record<string, unknown>, short: string, long: string): string | undefined {
  const v = o[short] !== undefined ? o[short] : o[long]
  if (v === null || v === undefined) return undefined
  return typeof v === "string" ? v : String(v)
}

function pickLlmOptStr(o: Record<string, unknown>, short: string, long: string): string | undefined {
  const v = o[short] !== undefined ? o[short] : o[long]
  if (v === null || v === undefined) return undefined
  return typeof v === "string" ? v : String(v)
}

function pickLlmNote(
  o: Record<string, unknown>,
  short: string,
  long: string,
): string | undefined | null {
  const v = o[short] !== undefined ? o[short] : o[long]
  if (v === null) return null
  if (v === undefined) return undefined
  return typeof v === "string" ? v : String(v)
}

function normalizeRawChunk(raw: RawChunk): RawChunk {
  const chunk =
    typeof raw.chunk === "string" ? raw.chunk : raw.chunk != null ? String(raw.chunk) : ""
  const meaning =
    typeof raw.meaning === "string" ? raw.meaning : raw.meaning != null ? String(raw.meaning) : ""
  return { ...raw, chunk, meaning }
}

function squashWsForReconcileCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

/**
 * Model occasionally returns one row whose Spanish field is a stringified reconciled-style
 * `[{type:"chunk"|"text",...},…]` array. `reconcileChunks` then treats it as literal text,
 * fails `indexOf` against the real source, and Read mode shows the raw JSON.
 */
function tryUnwrapEmbeddedReconciledJson(
  spanishField: string,
  sourcePageText: string,
): ReconciledItem[] | null {
  const t = spanishField.trim()
  if (t.length < 80 || !t.startsWith("[")) return null
  if (!/"type"\s*:\s*"(chunk|text)"/.test(t)) return null

  try {
    const parsed = JSON.parse(jsonrepair(t)) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    const items: ReconciledItem[] = []
    for (const el of parsed) {
      if (el == null || typeof el !== "object") continue
      const o = el as Record<string, unknown>
      if (o.type === "text") {
        const tx = o.text
        if (typeof tx === "string") items.push({ type: "text", text: tx })
        continue
      }
      if (o.type === "chunk") {
        const chunk = typeof o.chunk === "string" ? o.chunk : String(o.chunk ?? "")
        const meaning = typeof o.meaning === "string" ? o.meaning : String(o.meaning ?? "")
        if (!chunk.trim() || !meaning.trim()) continue
        items.push({
          type: "chunk",
          chunk,
          meaning,
          literal: typeof o.literal === "string" ? o.literal : undefined,
          note: typeof o.note === "string" ? o.note : undefined,
        })
        continue
      }
      const c = coerceLlmChunkRow(el)
      if (c) {
        items.push({
          type: "chunk",
          chunk: c.chunk,
          meaning: c.meaning,
          literal: c.literal,
          note: c.note,
        })
      }
    }

    if (!items.some((i) => i.type === "chunk")) return null

    const rebuilt = items.map((i) => (i.type === "text" ? i.text : i.chunk)).join("")
    if (squashWsForReconcileCompare(rebuilt) !== squashWsForReconcileCompare(sourcePageText)) {
      return null
    }
    return items
  } catch {
    return null
  }
}

/**
 * Last-line guard when a completion is still truncated (verbose model, cap mis-tuned, or missing `finish_reason`).
 * Distinct from viewport pagination: {@link LLM_CHUNK_INPUT_CHAR_CAP} should keep batches small enough that this rarely fires.
 */
function assertReconcileDidNotLeaveLongPlainTail(items: ReconciledItem[], sourceLen: number): void {
  if (items.length === 0 || sourceLen < 120) return
  const last = items[items.length - 1]!
  if (last.type !== "text") return
  const tail = last.text
  if (!/[\p{L}]/u.test(tail)) return
  const minSuspicious = Math.max(160, Math.floor(sourceLen * 0.09))
  if (tail.length >= minSuspicious) {
    throw new Error(
      "Chunking was cut off mid-page (model output limit). Tap Retry on this article page; if it keeps happening, lower LLM_CHUNK_INPUT_CHAR_CAP or raise TRANSLATE_MAX_COMPLETION_TOKENS.",
    )
  }
}

/**
 * If the model matched the inner word of a markdown-style **…** span, extend the match to include
 * those pairs. Does not absorb a lone * (e.g. multiplication or footnote markers between words).
 */
function snapBoldAsteriskWrappers(s: string, idx: number, len: number): { idx: number; len: number } {
  let i = idx
  let j = idx + len
  while (i >= 2 && s.slice(i - 2, i) === "**") i -= 2
  while (j + 2 <= s.length && s.slice(j, j + 2) === "**") j += 2
  return { idx: i, len: j - i }
}

function findChunkSpanInSource(
  original: string,
  span: string,
  searchStart: number,
): { idx: number; len: number } | null {
  const start = Math.max(0, searchStart - Math.max(0, span.length - 1))
  const tryNeedle = (needle: string): { idx: number; len: number } | null => {
    if (!needle) return null
    let idx = original.indexOf(needle, searchStart)
    if (idx === -1) idx = original.indexOf(needle, start)
    if (idx === -1) return null
    return snapBoldAsteriskWrappers(original, idx, needle.length)
  }

  const exact = tryNeedle(span)
  if (exact) return exact
  const stripped = span.replace(/^\*+/, "").replace(/\*+$/, "")
  if (!stripped || stripped === span) return null
  return tryNeedle(stripped)
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

    // Allow one-boundary overlap so "de"+"el" in "del" (and similar splits) still align: after
    // matching "de", `pos` sits on `l`; the next row "el" must match `el` inside "del", not a
    // later substring like the one starting "ella".
    const span = chunk.chunk
    const searchStart = Math.max(0, pos - span.length + 1)
    const found = findChunkSpanInSource(originalText, span, searchStart)
    if (!found) {
      result.push({ type: "chunk", ...chunk })
      continue
    }
    const { idx, len } = found
    const sourceSlice = originalText.slice(idx, idx + len)
    if (idx > pos) {
      result.push({ type: "text", text: originalText.slice(pos, idx) })
    }
    result.push({ type: "chunk", ...chunk, chunk: sourceSlice })
    pos = idx + len
  }

  if (pos < originalText.length) {
    result.push({ type: "text", text: originalText.slice(pos) })
  }

  return result
}

/** Same rules as `shouldGlueAfterPriorChunk` in text-chunk.tsx — keep in sync for length/slicing. */
function isPunctuationOnlyForReadGlue(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /^[^\w\u00C0-\u024F]+$/.test(t)
}

const OPENING_PUNCT_RE_FOR_READ_GLUE = /^[¿¡(«"“‘\u201C\u2018]/

function shouldGlueAfterPriorChunkReadGlue(nextChunkText: string): boolean {
  if (!isPunctuationOnlyForReadGlue(nextChunkText)) return false
  const t = nextChunkText.trim()
  if (OPENING_PUNCT_RE_FOR_READ_GLUE.test(t)) return false
  return true
}

/** Reconcile gaps that are only spaces + closing punct (e.g. ` , ` between “fue” and “a”). */
function isClosingPunctuationOnlyGap(s: string): boolean {
  return /^\s*[,.;:!?…]+(?:\s*[,.;:!?…]+)*\s*$/u.test(s)
}

/**
 * Attach closing punctuation/symbol-only chunks to the previous chunk so read mode does not
 * show them as separate tappable tokens (also fixes desktop read steps that slice between word and `.`).
 */
function coalesceGlueablePunctuationChunks<
  T extends { text: string; meaning?: string; literal?: string; grammar?: string },
>(chunks: T[]): T[] {
  if (chunks.length <= 1) return chunks
  const out: T[] = [chunks[0]!]
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i]!
    if (shouldGlueAfterPriorChunkReadGlue(c.text)) {
      const prev = out[out.length - 1]!
      prev.text += c.text
    } else {
      out.push(c)
    }
  }
  return out
}

/**
 * Merge closing punctuation-only chunk rows into the previous Spanish chunk (same rules as
 * {@link coalesceGlueablePunctuationChunks}). Article mode renders `ReconciledItem[]` directly;
 * without this, LLM rows like `","` stay a separate inline node on phones (read mode was already
 * fixed via `splitIntoSentences`).
 */
export function coalesceGlueablePunctuationReconciledItems(
  items: ReconciledItem[],
): ReconciledItem[] {
  const out: ReconciledItem[] = []
  let pendingText = ""

  const flushPendingText = () => {
    if (pendingText.length === 0) return
    out.push({ type: "text", text: pendingText })
    pendingText = ""
  }

  for (const item of items) {
    if (item.type === "text") {
      pendingText += item.text ?? ""
      continue
    }
    const span =
      typeof item.chunk === "string" ? item.chunk : String(item.chunk ?? "")
    const last = out[out.length - 1]

    if (last?.type === "chunk" && shouldGlueAfterPriorChunkReadGlue(span)) {
      const prefix = pendingText.replace(/\s+$/, "")
      last.chunk += prefix + span
      pendingText = ""
      continue
    }

    if (
      last?.type === "chunk" &&
      isClosingPunctuationOnlyGap(pendingText) &&
      !shouldGlueAfterPriorChunkReadGlue(span)
    ) {
      last.chunk += pendingText
      pendingText = ""
    }

    flushPendingText()
    out.push({
      type: "chunk",
      chunk: span,
      meaning: item.meaning,
      literal: item.literal,
      note: item.note,
    })
  }
  flushPendingText()
  return out
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
    if (
      currentChunks.length > 0 &&
      isClosingPunctuationOnlyGap(pendingBetween) &&
      !shouldGlueAfterPriorChunkReadGlue(span)
    ) {
      currentChunks[currentChunks.length - 1]!.text += pendingBetween
      pendingBetween = ""
    }
    const prefix = shouldGlueAfterPriorChunkReadGlue(span)
      ? pendingBetween.replace(/\s+$/, "")
      : pendingBetween

    // LLM often emits closing punctuation as its own row; attach to the preceding word
    // so read mode treats it as one token (same rules as glue for type:"text" gaps).
    if (currentChunks.length > 0 && shouldGlueAfterPriorChunkReadGlue(span)) {
      const prev = currentChunks[currentChunks.length - 1]!
      prev.text += prefix + span
      pendingBetween = ""
      const endsSentence = /[.!?]$/.test(span.trim())
      if (endsSentence && currentChunks.length > 0) {
        sentences.push({ id: sentences.length, chunks: currentChunks })
        currentChunks = []
      }
      continue
    }

    const chunkData = {
      id: chunkId++,
      text: prefix + span,
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
  let nextChunkId = 0
  return sentences.map((s) => ({
    ...s,
    chunks: coalesceGlueablePunctuationChunks(s.chunks.map((c) => ({ ...c }))).map((c) => ({
      ...c,
      id: nextChunkId++,
    })),
  }))
}

/**
 * Fallback words per LLM page when DOM measurement is unavailable (SSR / tiny viewport).
 * Normal path: `reading-page-measure` + `resolvePageSplitLimits` in the app shell.
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

/** Static fallback if DOM-based `measureArticlePageSplitLimits` cannot run yet. */
export function resolvePageSplitLimits(isMobileViewport: boolean): PageSplitLimits {
  const maxWords = isMobileViewport ? PAGE_SIZE_WORDS_MOBILE : PAGE_SIZE_WORDS_DESKTOP
  return { maxWords, maxChars: pageCharCapForWordLimit(maxWords) }
}

function countWordsInSentence(s: string): number {
  return s.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length
}

/**
 * Drop consecutive lines that are the same after collapsing internal whitespace and trimming.
 * Many PDF/ebook copies duplicate each line; once newlines become spaces the source repeats
 * whole phrases (`...Pastora Había nacido...`). The model chunks a single narrative stream, so
 * {@link reconcileChunks} would jump with `indexOf` and leave huge plain-text gaps.
 */
export function dedupeConsecutiveDuplicateLines(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let prevKey = ""
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").trim()
    if (key !== "" && key === prevKey) continue
    out.push(line)
    prevKey = key === "" ? "" : key
  }
  return out.join("\n")
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
 * This prevents mobile overflow when a long intro contains one very long sentence.
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
 * Page breaks are driven by `maxChars` first when limits come from DOM measurement (large `maxWords`).
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

/**
 * After `buildSentencePages`, optionally merge into a single `translatePageText` batch on desktop.
 *
 * Merge only when the full paste fits **both** (a) the incoming `limits.maxChars` (already clamped for LLM
 * via {@link clampPageLimitsForLlmBatching} at the call site) and (b) {@link LLM_CHUNK_INPUT_CHAR_CAP}
 * defensively here so callers never collapse more Spanish into one completion than the model can chunk.
 *
 * Static mobile fallback uses a low word cap (~68) *and* a char cap; the word check can split into two
 * pages even when the whole text still fits under `maxChars`, leaving a tiny second page. DOM-measured
 * limits rarely hit that because `maxWords` is huge and only `maxChars` binds.
 *
 * On mobile, merging to a single page is skipped when multiple batches already exist: one tall page clips
 * under `overflow-y` layout and would hide the pagination footer.
 */
export function mergeArticlePagesIfWholeTextFitsLimits(
  pages: string[][],
  limits: PageSplitLimits,
  fullText: string,
  isMobileViewport = false,
): string[][] {
  const t = fullText.replace(/\s+/g, " ").trim()
  const nonEmpty = pages
    .map((p) => p.filter((s) => s.trim().length > 0))
    .filter((p) => p.length > 0)
  if (nonEmpty.length <= 1) return nonEmpty.length > 0 ? nonEmpty : [[t]]

  if (isMobileViewport) {
    return nonEmpty
  }

  const mergeBudget = Math.min(limits.maxChars, LLM_CHUNK_INPUT_CHAR_CAP)
  if (t.length > 0 && t.length <= mergeBudget) {
    return [[t]]
  }
  return nonEmpty
}

/** Single LLM call: chunk JSON → reconciled items for one page of source text. */
export async function translatePageText(input: string): Promise<ReconciledItem[]> {
  const canonical = squashWsForReconcileCompare(input)
  if (!canonical) {
    throw new Error("No text to translate.")
  }

 const systemContent = ""
  const userContent = PROMPT(canonical)

  const base = {
    model: translateModel(),
    messages: [{ role: "system", content: systemContent }, { role: "user", content: userContent }],
    temperature: 0,
    max_tokens: TRANSLATE_MAX_COMPLETION_TOKENS,
  }
  const res = await fetchChatCompletion(
    translationProvider() === "groq"
      ? {
          ...base,
          // reasoning_effort: TRANSLATE_REASONING_EFFORT,
          // reasoning_format: GROQ_REASONING_FORMAT_HIDDEN,
        }
      : base,
  )

  if (!res.ok) {
    const detail = await parseChatJsonErrorBody(res)
    throwChatHttpError(res, detail)
  }

  const data = await res.json()
  const finish = chatFinishReasonFromOpenAiStylePayload(data)
  if (finish === "length") {
    throw new Error(
      "The model hit its output limit before finishing chunking this page. Tap Retry, or adjust LLM_CHUNK_INPUT_CHAR_CAP / TRANSLATE_MAX_COMPLETION_TOKENS if this is frequent.",
    )
  }
  const raw = combineAssistantPayloadsForChunkParse(data)
  const parsed = extractChunkJsonArrayFromText(raw)
  const merged = postProcessChunks(parsed)
  const chunks: RawChunk[] = []
  for (const row of merged) {
    const c = coerceLlmChunkRow(row)
    if (c) chunks.push(normalizeRawChunk(c))
  }

  if (chunks.length === 1) {
    const unwrapped = tryUnwrapEmbeddedReconciledJson(chunks[0]!.chunk, canonical)
    if (unwrapped) {
      if (!unwrapped.some((item) => item.type === "chunk")) {
        throw new Error(
          "Model returned no usable chunk rows: each object needs Spanish \"c\" and English \"m\". Without them the UI would show plain text only (one big type:text span).",
        )
      }
      return coalesceGlueablePunctuationReconciledItems(unwrapped)
    }
  }

  const reconciled = reconcileChunks(chunks, canonical)
  if (!reconciled.some((item) => item.type === "chunk")) {
    throw new Error(
      "Model returned no usable chunk rows: each object needs Spanish \"c\" and English \"m\". Without them the UI would show plain text only (one big type:text span).",
    )
  }
  assertReconcileDidNotLeaveLongPlainTail(reconciled, canonical.length)
  return coalesceGlueablePunctuationReconciledItems(reconciled)
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
 * (LLM page size comes from DOM-measured article column; this only splits display steps.)
 */
export const READ_MODE_WORDS_PER_STEP_MOBILE = 18

/** Read-mode step size on desktop: exact character count per page (including spaces between chunks). */
export const READ_MODE_CHARS_PER_STEP_DESKTOP = 100

type ReadChunkRow = ReadSentence["chunks"][number]

type ReadPart = { kind: "gap" } | { kind: "chunk"; idx: number }

function buildReadParts(chunks: ReadChunkRow[]): ReadPart[] {
  const out: ReadPart[] = []
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!
    if (i > 0) {
      if (!shouldGlueAfterPriorChunkReadGlue(c.text)) out.push({ kind: "gap" })
    }
    out.push({ kind: "chunk", idx: i })
  }
  return out
}

function joinedReadLengthFromParts(chunks: ReadChunkRow[], parts: ReadPart[]): number {
  let n = 0
  for (const p of parts) {
    n += p.kind === "gap" ? 1 : chunks[p.idx]!.text.length
  }
  return n
}

function buildJoinedReadString(chunks: ReadChunkRow[], parts: ReadPart[]): string {
  let s = ""
  for (const p of parts) {
    if (p.kind === "gap") s += " "
    else s += chunks[p.idx]!.text
  }
  return s
}

/** Exclusive end `b` is a word boundary when the next char is whitespace or end of string. */
function isValidWordBreakEnd(S: string, b: number): boolean {
  return b === S.length || /\s/.test(S[b]!)
}

/**
 * Prefer a break at or before `idealEnd`; if that would cut mid-word, back up to the last space
 * or extend to the next space / end of string (never splits a word).
 */
function findWordBoundaryEnd(S: string, sliceStart: number, idealEnd: number): number {
  const len = S.length
  const cap = Math.min(idealEnd, len)
  for (let b = cap; b > sliceStart; b--) {
    if (isValidWordBreakEnd(S, b)) return b
  }
  let b = Math.max(cap, sliceStart + 1)
  while (b < len && !isValidWordBreakEnd(S, b)) b++
  return b
}

/**
 * Desktop Read mode: each step targets ~`charsPerStep` characters of the joined Spanish
 * (chunk texts + read-mode gaps), ending only at word boundaries (whitespace).
 * The last step for each LLM page may be shorter; a single word longer than the cap stays one step.
 */
export function subdivideReadStepsForDesktop(
  sentences: ReadSentence[],
  charsPerStep: number = READ_MODE_CHARS_PER_STEP_DESKTOP,
): ReadSentence[] {
  const flat: Array<{ chunk: ReadChunkRow; sourcePageIndex: number }> = []
  for (const sent of sentences) {
    for (const c of sent.chunks) {
      flat.push({ chunk: c, sourcePageIndex: sent.sourcePageIndex })
    }
  }
  if (flat.length === 0) return []

  const out: ReadSentence[] = []
  let nextSentenceId = 0
  let chunkId = 0

  let i = 0
  while (i < flat.length) {
    const page = flat[i]!.sourcePageIndex
    const group: ReadChunkRow[] = []
    while (i < flat.length && flat[i]!.sourcePageIndex === page) {
      group.push(flat[i]!.chunk)
      i++
    }

    const parts = buildReadParts(group)
    const totalLen = joinedReadLengthFromParts(group, parts)
    if (totalLen === 0) continue

    const S = buildJoinedReadString(group, parts)
    let sliceStart = 0
    while (sliceStart < totalLen) {
      const idealEnd = sliceStart + charsPerStep
      const b = findWordBoundaryEnd(S, sliceStart, idealEnd)
      const a = sliceStart
      if (b <= sliceStart) break

      const stepChunks: ReadChunkRow[] = []
      let pos = 0
      for (const part of parts) {
        const segment = part.kind === "gap" ? " " : group[part.idx]!.text
        const segLen = segment.length
        const partEnd = pos + segLen
        if (partEnd <= a || pos >= b) {
          pos = partEnd
          continue
        }
        const lo = Math.max(0, a - pos)
        const hi = Math.min(segLen, b - pos)
        const frag = segment.slice(lo, hi)
        if (!frag) {
          pos = partEnd
          continue
        }
        if (part.kind === "gap") {
          stepChunks.push({
            id: chunkId++,
            text: frag,
            meaning: " ",
            literal: " ",
          })
        } else {
          const ck = group[part.idx]!
          stepChunks.push({
            ...ck,
            id: chunkId++,
            text: frag,
          })
        }
        pos = partEnd
      }

      const merged = coalesceGlueablePunctuationChunks(stepChunks.map((c) => ({ ...c })))
      if (merged.length === 1 && shouldGlueAfterPriorChunkReadGlue(merged[0]!.text) && out.length > 0) {
        const prevChunks = out[out.length - 1]!.chunks
        if (prevChunks.length > 0) {
          prevChunks[prevChunks.length - 1]!.text += merged[0]!.text
          sliceStart = b
          continue
        }
      }
      if (merged.length > 0) {
        out.push({
          id: nextSentenceId++,
          sourcePageIndex: page,
          chunks: merged.map((c) => ({ ...c, id: chunkId++ })),
        })
      }
      sliceStart = b
    }
  }

  return out.map((s, idx) => ({ ...s, id: idx }))
}

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
): Promise<{ reconciled: ReconciledItem[]; sentences: ReturnType<typeof splitIntoSentences> }> {
  const reconciled = await translatePageText(input)
  const sentences = splitIntoSentences(reconciled)
  return { reconciled, sentences }
}

export async function generateRandomSpanish(): Promise<string> {
  /**
   * Use {@link learnModel} (not {@link translateModel}): the translate model on Groq is a
   * reasoning model whose hidden reasoning shares the completion budget — with a low
   * `max_tokens` the visible paragraph was often truncated mid-sentence. The learn stack
   * is already used for similar short Spanish generation (Learn pill) without that issue.
   */
  const res = await fetchChatCompletion({
    model: learnModel(),
    messages: [
      {
        role: "user",
        content: `Write one short paragraph in natural Spanish (about 3–5 sentences).

You choose the topic, setting, tone, and register freely — fiction, opinion, dialogue, description, anything. Be creative and make each response feel different when asked again.

Use idiomatic Spanish. Return only the Spanish paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`,
      },
    ],
    temperature: 1.5,
    max_tokens: 800,
  })

  if (!res.ok) {
    const detail = await parseChatJsonErrorBody(res)
    throwChatHttpError(res, detail)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const out = stringifyMessageContent(data.choices?.[0]?.message?.content)
  if (!out) throw new Error("Empty response from language model.")
  return out
}

const LEARN_PARAGRAPH_PROMPT = `Pick a random subject from this list, then pick a specific topic within that subject entirely on your own. Write a single paragraph of 75–100 words about it.

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

Write the entire paragraph in Spanish.

Return only the Spanish paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`

const LEARN_RANDOM_MAX_WORDS = 100

function truncateLearnParagraphToWordLimit(text: string, maxWords: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return normalized
  return `${words.slice(0, maxWords).join(" ")}…`
}

/**
 * Learn pill: topic paragraph via the configured learn model (Spanish, ~75–100 words).
 * Replaces the former Spanish Wikipedia featured-article fetch.
 */
export async function fetchLearnRandomParagraph(): Promise<string> {
  const res = await fetchChatCompletion({
    model: learnModel(),
    messages: [{ role: "user", content: LEARN_PARAGRAPH_PROMPT }],
    temperature: 1.5,
    max_tokens: 500,
  })

  if (!res.ok) {
    const detail = await parseChatJsonErrorBody(res)
    throwChatHttpError(res, detail)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const raw = stringifyMessageContent(data.choices?.[0]?.message?.content)
  if (!raw?.trim()) throw new Error("Empty response from language model.")
  const intro = truncateLearnParagraphToWordLimit(raw, LEARN_RANDOM_MAX_WORDS)
  if (intro.length < 40) {
    throw new Error("No se pudo generar un párrafo. Inténtalo de nuevo.")
  }
  return intro
}

/** Spanish-first speech-to-text via Groq Whisper (proxied through Edge Function). */
export async function transcribeAudioWithGroq(
  audioBlob: Blob,
  filename = "recording.webm",
): Promise<string> {
  return transcribeAudioViaEdge(audioBlob, filename)
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
