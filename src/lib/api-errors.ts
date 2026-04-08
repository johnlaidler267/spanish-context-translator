/**
 * Groq/OpenAI-style throttling.
 *
 * Do not treat bare "HTTP 429" as a match: Supabase/Edge and other layers return
 * 429 for unrelated reasons, and `UsageError` uses `HTTP ${status}` — that was
 * incorrectly opening the Groq "rate limit" modal.
 *
 * Real LLM throttle copy almost always includes one of the phrases below; our
 * `translate.ts` throws messages that include "rate limit" for Groq 429.
 */
export function isRateLimitApiMessage(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /rate[\s_-]*limit|ratelimit/.test(m) ||
    m.includes("too many requests") ||
    m.includes("throttl") ||
    m.includes("requests per minute") ||
    m.includes("tokens per minute") ||
    m.includes("tpm") ||
    m.includes("rpm") ||
    m.includes("over capacity") ||
    m.includes("quota exceeded") ||
    m.includes("gemini quota")
  )
}

/**
 * Whether a failed translate / edge call is worth auto-retrying (transient network or server).
 * Avoids hammering rate limits, auth failures, or obvious bad requests.
 */
export function isRetryableTranslationFailure(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (isRateLimitApiMessage(trimmed)) return false
  const m = trimmed.toLowerCase()
  if (m.includes("http 401") || m.includes("http 403")) return false
  if (m.includes("http 404")) return false
  if (m.includes("http 400")) return false
  if (m.includes("invalid api key") || m.includes("incorrect api key")) return false
  if (/http 5\d\d/.test(m)) return true
  if (m.includes("http 408")) return true
  if (m.includes("failed to fetch")) return true
  if (m.includes("networkerror") || m.includes("load failed")) return true
  if (m.includes("econnrefused") || m.includes("econnreset")) return true
  if (m.includes("timeout") || m.includes("timed out")) return true
  if (m.includes("temporarily unavailable")) return true
  return false
}
