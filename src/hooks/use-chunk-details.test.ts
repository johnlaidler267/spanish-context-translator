import { describe, expect, it, vi } from "vitest"
import { DetailsRequestError, detailsErrorMessage, fetchDetailsFromEdge } from "@/hooks/use-chunk-details"
import { fetchChunkDetailsViaEdge } from "@/lib/groq-edge"

vi.mock("@/lib/groq-edge", () => ({ fetchChunkDetailsViaEdge: vi.fn() }))

describe("detailsErrorMessage", () => {
  it("names a rate limit instead of blaming the connection", () => {
    expect(detailsErrorMessage(new DetailsRequestError("Groq error: 429", 502))).toMatch(/Too many lookups/)
    expect(detailsErrorMessage(new DetailsRequestError("HTTP 429", 429))).toMatch(/Too many lookups/)
  })

  it("tells an expired session to refresh", () => {
    expect(detailsErrorMessage(new DetailsRequestError("Unauthorized", 401))).toMatch(/session expired/)
  })

  it("shows the server's reason for other failures", () => {
    expect(detailsErrorMessage(new DetailsRequestError("Service misconfigured", 500))).toBe(
      "Couldn't load details (Service misconfigured). Try again in a moment.",
    )
  })

  it("only mentions the connection when the request never got a response", () => {
    expect(detailsErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Check your connection/)
    expect(detailsErrorMessage(new Error("No session"))).toBe("Couldn't load details (No session).")
  })
})

describe("fetchDetailsFromEdge", () => {
  const prefs = { learning: "spanish", native: "english" } as const

  it("rejects raw model JSON instead of showing it as the explanation", async () => {
    // What the server passed through when the model answered with one object per verb in the sentence.
    const dump = '[{"kind":"verb","infinitive":"resultar","tense":"imperfect"},{"kind":"verb","infinitive":"sugerir"}]'
    vi.mocked(fetchChunkDetailsViaEdge).mockResolvedValue(
      new Response(JSON.stringify({ kind: "other", explanation: dump }), { status: 200 }),
    )
    await expect(fetchDetailsFromEdge("objetos", "poblado de objetos", prefs)).rejects.toThrow(
      /unreadable answer/,
    )
  })

  it("passes ordinary prose through", async () => {
    vi.mocked(fetchChunkDetailsViaEdge).mockResolvedValue(
      new Response(JSON.stringify({ kind: "other", explanation: "Plural of 'objeto': objects." }), {
        status: 200,
      }),
    )
    await expect(fetchDetailsFromEdge("objetos", "", prefs)).resolves.toEqual({
      type: "llm",
      text: "Plural of 'objeto': objects.",
    })
  })
})
