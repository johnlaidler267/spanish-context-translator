/**
 * Groq/OpenAI-style throttling (body often omits the words “rate limit” — e.g. only `HTTP 429`).
 */
export function isRateLimitApiMessage(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /rate[\s_-]*limit|ratelimit/.test(m) ||
    /\b429\b/.test(m) ||
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
