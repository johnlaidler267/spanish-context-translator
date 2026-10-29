import { afterEach, describe, expect, it, vi } from "vitest"

const fetchGeminiChatViaEdge = vi.fn<(body: object) => Promise<Response>>()

vi.mock("@/lib/groq-edge", () => ({
  fetchGeminiChatViaEdge: (body: object) => fetchGeminiChatViaEdge(body),
  fetchGroqChatViaEdge: vi.fn(),
}))
vi.mock("@/lib/translate/llm-settings", () => ({ translationProvider: () => "gemini" }))

import { fetchChatCompletion, throwChatHttpError } from "@/lib/translate/chat-completion"

function rateLimited(message: string, retryAfter = "1"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Retry-After": retryAfter },
  })
}

afterEach(() => {
  fetchGeminiChatViaEdge.mockReset()
  vi.useRealTimers()
})

describe("fetchChatCompletion 429 handling", () => {
  it("does not retry our edge function's daily cap", async () => {
    fetchGeminiChatViaEdge.mockResolvedValue(
      rateLimited("Daily usage limit reached. Please try again tomorrow.", "50000"),
    )
    const res = await fetchChatCompletion({})
    expect(res.status).toBe(429)
    expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1)
  })

  it("retries once after Retry-After for a per-minute throttle", async () => {
    vi.useFakeTimers()
    fetchGeminiChatViaEdge
      .mockResolvedValueOnce(rateLimited("Too many requests. Please wait a minute and try again."))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const pending = fetchChatCompletion({})
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await pending).status).toBe(200)
    expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(2)
  })
})

describe("throwChatHttpError", () => {
  it("shows the daily cap message as-is, not the Gemini billing explainer", () => {
    expect(() =>
      throwChatHttpError(
        new Response(null, { status: 429 }),
        "Daily usage limit reached. Please try again tomorrow.",
      ),
    ).toThrow(/^Daily usage limit reached\. Please try again tomorrow\.$/)
  })
})
