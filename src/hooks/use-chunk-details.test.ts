import { describe, expect, it } from "vitest"
import { DetailsRequestError, detailsErrorMessage } from "@/hooks/use-chunk-details"

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
