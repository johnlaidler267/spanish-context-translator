import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
}

const fetchGeminiChatViaEdge = vi.fn()
vi.mock("@/lib/groq-edge", () => ({
  fetchGeminiChatViaEdge: (...args: unknown[]) => fetchGeminiChatViaEdge(...args),
}))

/** The cloud half of the write (see pushPageRecap) -- mocked so these stay offline. */
const pushPageRecap = vi.fn()
vi.mock("@/lib/storage/reading-progress-sync", () => ({
  pushPageRecap: (...args: unknown[]) => pushPageRecap(...args),
}))

const getCachedSupabaseAccessToken = vi.fn()
vi.mock("@/lib/supabase", () => ({
  getCachedSupabaseAccessToken: () => getCachedSupabaseAccessToken(),
}))

const user = { id: "user-1" } as User

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe("page-recap", () => {
  const sendBeacon = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
    vi.stubGlobal("navigator", { sendBeacon })
    vi.resetModules()
    fetchGeminiChatViaEdge.mockReset()
    pushPageRecap.mockReset().mockResolvedValue(undefined)
    getCachedSupabaseAccessToken.mockReset().mockReturnValue(null)
    sendBeacon.mockReset().mockReturnValue(true)
  })

  afterEach(() => vi.unstubAllGlobals())

  describe("summarizePreviousPageForRecap", () => {
    it("sends the cheap allowed model and the raw page text, and returns the reply", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "A duck learns to swim." } }] }),
      )
      const { summarizePreviousPageForRecap } = await import("@/lib/translate/page-recap")
      const result = await summarizePreviousPageForRecap("El pato aprendió a nadar en el lago.")
      expect(result).toBe("A duck learns to swim.")
      expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1)
      const [body] = fetchGeminiChatViaEdge.mock.calls[0] as [Record<string, unknown>]
      expect(body.model).toBe("gemini-2.5-flash-lite")
      const messages = body.messages as Array<{ role: string; content: string }>
      expect(messages.some((m) => m.role === "user" && m.content.includes("pato"))).toBe(true)
    })

    it("does not call the network for empty text", async () => {
      const { summarizePreviousPageForRecap } = await import("@/lib/translate/page-recap")
      const result = await summarizePreviousPageForRecap("   ")
      expect(result).toBe("")
      expect(fetchGeminiChatViaEdge).not.toHaveBeenCalled()
    })

    it("returns empty string (never throws) on a non-2xx response", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(jsonResponse({ error: { message: "quota" } }, false, 429))
      const { summarizePreviousPageForRecap } = await import("@/lib/translate/page-recap")
      await expect(summarizePreviousPageForRecap("Texto de prueba.")).resolves.toBe("")
    })

    it("returns empty string (never throws) when the request itself rejects", async () => {
      fetchGeminiChatViaEdge.mockRejectedValue(new Error("network down"))
      const { summarizePreviousPageForRecap } = await import("@/lib/translate/page-recap")
      await expect(summarizePreviousPageForRecap("Texto de prueba.")).resolves.toBe("")
    })
  })

  describe("maybeSummarizePreviousPageOnLeave", () => {
    const pages = [["Page one sentence."], ["Page two sentence."], ["Page three sentence."]]

    it("skips the call entirely when leaving on page 1 (no previous page)", async () => {
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      await maybeSummarizePreviousPageOnLeave({
        user,
        contentId: "book-1",
        leavingAtPageIndex: 0,
        pages,
      })
      expect(fetchGeminiChatViaEdge).not.toHaveBeenCalled()
    })

    it("skips entirely when there's no contentId (plain pasted text)", async () => {
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      await maybeSummarizePreviousPageOnLeave({
        user,
        contentId: null,
        leavingAtPageIndex: 2,
        pages,
      })
      expect(fetchGeminiChatViaEdge).not.toHaveBeenCalled()
    })

    it("summarizes the page before the leaving page and caches it", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap of page two." } }] }),
      )
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      const { getCachedPageRecap } = await import("@/lib/storage/reading-recap-storage")

      await maybeSummarizePreviousPageOnLeave({
        user,
        contentId: "book-1",
        leavingAtPageIndex: 2,
        pages,
      })

      expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1)
      // Leaving at page index 2 -> summarizes page index 1 (the page before it).
      expect(getCachedPageRecap(user, "book-1", 1)).toBe("Recap of page two.")
    })

    it("does not call the network again once a recap for that exact position is cached", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap of page two." } }] }),
      )
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      await maybeSummarizePreviousPageOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      await maybeSummarizePreviousPageOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1)
    })

    it("tags the cached recap with the sentence-index anchor for the previous page, when given one", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap of page two." } }] }),
      )
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      const { getCachedPageRecap } = await import("@/lib/storage/reading-recap-storage")

      // Anchors for pages [0, 1, 2] -- page 1 (the one being summarized) starts at sentence 7.
      await maybeSummarizePreviousPageOnLeave({
        user,
        contentId: "book-1",
        leavingAtPageIndex: 2,
        pages,
        pageStartSentenceIndices: [0, 7, 14],
      })

      // Simulates reopening on a device whose own page-split puts that same sentence-7 spot at
      // a different raw page index (4, not 1) -- the recap should still be found by anchor.
      expect(getCachedPageRecap(user, "book-1", 4, 7)).toBe("Recap of page two.")
    })

    it("also pushes the recap to the cloud row so it survives a different browser/session", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap of page two." } }] }),
      )
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      await maybeSummarizePreviousPageOnLeave({
        user,
        contentId: "book-1",
        leavingAtPageIndex: 2,
        pages,
        pageStartSentenceIndices: [0, 7, 14],
      })

      expect(pushPageRecap).toHaveBeenCalledTimes(1)
      expect(pushPageRecap.mock.calls[0]![0]).toMatchObject({
        contentId: "book-1",
        summary: "Recap of page two.",
        // The page summarized is the one *before* the leave point, with its own anchor...
        forPageIndex: 1,
        forSentenceIndex: 7,
        // ...while the position is where the reader actually left off.
        position: { pageIndex: 2, totalPages: 3, sentenceIndex: 14 },
      })
    })

    it("does not push anything to the cloud when the summarization call fails", async () => {
      fetchGeminiChatViaEdge.mockResolvedValue(jsonResponse({ error: "nope" }, false, 500))
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      await maybeSummarizePreviousPageOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      expect(pushPageRecap).not.toHaveBeenCalled()
    })

    it("collapses two concurrent calls for the same leave into a single network request", async () => {
      let resolveFetch!: (v: Response) => void
      fetchGeminiChatViaEdge.mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
      )
      const { maybeSummarizePreviousPageOnLeave } = await import("@/lib/translate/page-recap")
      const p1 = maybeSummarizePreviousPageOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      const p2 = maybeSummarizePreviousPageOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      resolveFetch(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap." } }] }),
      )
      await Promise.all([p1, p2])
      expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1)
    })
  })

  describe("sendPageRecapBeaconOnLeave", () => {
    const pages = [["Page one sentence."], ["Page two sentence."], ["Page three sentence."]]

    it("sends a beacon (not a fetch) when signed in with a cached access token", async () => {
      getCachedSupabaseAccessToken.mockReturnValue("token-abc")
      const { sendPageRecapBeaconOnLeave } = await import("@/lib/translate/page-recap")

      sendPageRecapBeaconOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })

      expect(fetchGeminiChatViaEdge).not.toHaveBeenCalled()
      expect(sendBeacon).toHaveBeenCalledTimes(1)
      const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob]
      expect(url).toBe("https://example.supabase.co/functions/v1/recap-beacon")
      expect(blob.type).toBe("application/json")
      const payload = JSON.parse(await blob.text()) as Record<string, unknown>
      expect(payload).toMatchObject({
        access_token: "token-abc",
        contentId: "book-1",
        // Leaving at page index 2 -> the page before it (index 1) is what gets summarized.
        forPageIndex: 1,
        position: { pageIndex: 2, totalPages: 3 },
      })
      expect(payload.previousPageSourceText).toContain("Page two")
    })

    it("falls back to the awaited fetch path for a guest (no reading_progress row to write to)", async () => {
      getCachedSupabaseAccessToken.mockReturnValue(null)
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap." } }] }),
      )
      const { sendPageRecapBeaconOnLeave } = await import("@/lib/translate/page-recap")

      sendPageRecapBeaconOnLeave({ user: null, contentId: "book-1", leavingAtPageIndex: 2, pages })
      await vi.waitFor(() => expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1))
      expect(sendBeacon).not.toHaveBeenCalled()
    })

    it("falls back to the awaited fetch path when signed in but no token is cached yet", async () => {
      getCachedSupabaseAccessToken.mockReturnValue(null)
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap." } }] }),
      )
      const { sendPageRecapBeaconOnLeave } = await import("@/lib/translate/page-recap")

      sendPageRecapBeaconOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      await vi.waitFor(() => expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1))
      expect(sendBeacon).not.toHaveBeenCalled()
    })

    it("falls back to the awaited fetch path when the browser refuses to queue the beacon", async () => {
      getCachedSupabaseAccessToken.mockReturnValue("token-abc")
      sendBeacon.mockReturnValue(false)
      fetchGeminiChatViaEdge.mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: "assistant", content: "Recap." } }] }),
      )
      const { sendPageRecapBeaconOnLeave } = await import("@/lib/translate/page-recap")

      sendPageRecapBeaconOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      await vi.waitFor(() => expect(fetchGeminiChatViaEdge).toHaveBeenCalledTimes(1))
    })

    it("does nothing at all when leaving on page 1 (no previous page)", async () => {
      getCachedSupabaseAccessToken.mockReturnValue("token-abc")
      const { sendPageRecapBeaconOnLeave } = await import("@/lib/translate/page-recap")
      sendPageRecapBeaconOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 0, pages })
      expect(sendBeacon).not.toHaveBeenCalled()
      expect(fetchGeminiChatViaEdge).not.toHaveBeenCalled()
    })

    it("sends only one beacon across repeated calls for the same leave point", async () => {
      getCachedSupabaseAccessToken.mockReturnValue("token-abc")
      const { sendPageRecapBeaconOnLeave } = await import("@/lib/translate/page-recap")
      sendPageRecapBeaconOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      sendPageRecapBeaconOnLeave({ user, contentId: "book-1", leavingAtPageIndex: 2, pages })
      expect(sendBeacon).toHaveBeenCalledTimes(1)
    })
  })
})
