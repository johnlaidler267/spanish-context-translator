import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"

// The vitest env here is `node` (no jsdom / localStorage) -- same stub approach as
// guest-usage.test.ts.
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

const upsertMock = vi.fn()
const eqMock = vi.fn()
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ upsert: upsertMock, select: selectMock }))

vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}))

const user = { id: "user-1" } as User
const otherUser = { id: "user-2" } as User

describe("reading-progress-sync", () => {
  beforeEach(async () => {
    // vitest's env here is `node` -- reading-progress-storage.ts guards its localStorage reads
    // with `typeof window === "undefined"` (SSR-safety in the real app), so `window` needs a
    // stub too, not just `localStorage`, or every read silently no-ops.
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", makeMemoryStorage())
    vi.useFakeTimers()
    upsertMock.mockReset().mockResolvedValue({ error: null })
    eqMock.mockReset().mockResolvedValue({ data: [], error: null })
    fromMock.mockClear()
    const { resetReadingProgressSyncCache } = await import("@/lib/storage/reading-progress-sync")
    resetReadingProgressSyncCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe("pushReadingProgress", () => {
    it("does nothing for a signed-out (null) user", async () => {
      const { pushReadingProgress } = await import("@/lib/storage/reading-progress-sync")
      pushReadingProgress(null, "book-1", 3)
      await vi.advanceTimersByTimeAsync(5000)
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("debounces rapid page turns into a single upsert with the latest position", async () => {
      const { pushReadingProgress } = await import("@/lib/storage/reading-progress-sync")
      pushReadingProgress(user, "book-1", 1, 10)
      await vi.advanceTimersByTimeAsync(200)
      pushReadingProgress(user, "book-1", 2, 10)
      await vi.advanceTimersByTimeAsync(200)
      pushReadingProgress(user, "book-1", 3, 10)

      // Still inside the debounce window -- nothing sent yet.
      await vi.advanceTimersByTimeAsync(1000)
      expect(upsertMock).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1000)
      expect(upsertMock).toHaveBeenCalledTimes(1)
      const [row, opts] = upsertMock.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
      expect(row).toMatchObject({
        user_id: "user-1",
        content_id: "book-1",
        page_index: 3,
        total_pages: 10,
      })
      expect(opts).toEqual({ onConflict: "user_id,content_id" })
    })

    it("debounces separately per content id", async () => {
      const { pushReadingProgress } = await import("@/lib/storage/reading-progress-sync")
      pushReadingProgress(user, "book-1", 1)
      pushReadingProgress(user, "book-2", 5)
      await vi.advanceTimersByTimeAsync(2000)
      expect(upsertMock).toHaveBeenCalledTimes(2)
    })

    it("ignores an invalid page index", async () => {
      const { pushReadingProgress } = await import("@/lib/storage/reading-progress-sync")
      pushReadingProgress(user, "book-1", -1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(upsertMock).not.toHaveBeenCalled()
    })
  })

  describe("ensureCloudReadingProgressPulled", () => {
    it("resolves without hitting the network for a null user", async () => {
      const { ensureCloudReadingProgressPulled } = await import("@/lib/storage/reading-progress-sync")
      await ensureCloudReadingProgressPulled(null)
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("merges pulled rows into the local cache so getReadingProgress sees them", async () => {
      eqMock.mockResolvedValue({
        data: [
          { content_id: "book-1", page_index: 7, total_pages: 20, updated_at: "2026-01-01T00:00:00.000Z" },
        ],
        error: null,
      })
      const { ensureCloudReadingProgressPulled } = await import("@/lib/storage/reading-progress-sync")
      const { getReadingProgress } = await import("@/lib/storage/reading-progress-storage")

      expect(getReadingProgress(user, "book-1")).toBeNull()
      await ensureCloudReadingProgressPulled(user)
      expect(getReadingProgress(user, "book-1")).toBe(7)
    })

    it("only fetches once per user id -- a second call for the same user is a cache hit", async () => {
      const { ensureCloudReadingProgressPulled } = await import("@/lib/storage/reading-progress-sync")
      await ensureCloudReadingProgressPulled(user)
      await ensureCloudReadingProgressPulled(user)
      expect(fromMock).toHaveBeenCalledTimes(1)
    })

    it("refetches when the user id changes", async () => {
      const { ensureCloudReadingProgressPulled } = await import("@/lib/storage/reading-progress-sync")
      await ensureCloudReadingProgressPulled(user)
      await ensureCloudReadingProgressPulled(otherUser)
      expect(fromMock).toHaveBeenCalledTimes(2)
    })

    it("does not let a stale (older) cloud row overwrite a newer local write", async () => {
      const { setReadingProgress } = await import("@/lib/storage/reading-progress-storage")
      const { ensureCloudReadingProgressPulled } = await import("@/lib/storage/reading-progress-sync")
      const { getReadingProgress } = await import("@/lib/storage/reading-progress-storage")

      setReadingProgress(user, "book-1", 15, 20) // "now" -- newer than the stale cloud row below
      eqMock.mockResolvedValue({
        data: [
          { content_id: "book-1", page_index: 2, total_pages: 20, updated_at: "2020-01-01T00:00:00.000Z" },
        ],
        error: null,
      })
      await ensureCloudReadingProgressPulled(user)
      expect(getReadingProgress(user, "book-1")).toBe(15)
    })

    it("swallows a query error and leaves local progress untouched", async () => {
      eqMock.mockResolvedValue({ data: null, error: { message: "boom" } })
      const { ensureCloudReadingProgressPulled } = await import("@/lib/storage/reading-progress-sync")
      await expect(ensureCloudReadingProgressPulled(user)).resolves.toBeUndefined()
    })
  })
})
