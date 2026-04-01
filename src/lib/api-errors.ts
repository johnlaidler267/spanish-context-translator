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
    m.includes("quota exceeded")
  )
}
