import {
  fetchGeminiChatViaEdge,
  fetchGroqChatViaEdge,
} from "@/lib/groq-edge"
import { translationProvider } from "@/lib/translate/llm-settings"

export async function parseChatJsonErrorBody(res: Response): Promise<string> {
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

export function throwChatHttpError(res: Response, detail: string): never {
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
export async function fetchChatCompletion(body: object): Promise<Response> {
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

export function stringifyMessageContent(content: unknown): string {
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
export function combineAssistantPayloadsForChunkParse(data: unknown): string {
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

export function chatFinishReasonFromOpenAiStylePayload(data: unknown): string | undefined {
  const fr = (data as { choices?: Array<{ finish_reason?: string }> })?.choices?.[0]?.finish_reason
  return typeof fr === "string" ? fr : undefined
}
