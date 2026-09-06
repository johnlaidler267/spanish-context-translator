import { describe, it, expect, beforeEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"
import type { LibraryEpub } from "@/lib/storage/epub-library"

const listUserEpubsMock = vi.fn<(user: User | null) => Promise<LibraryEpub[]>>()

vi.mock("@/lib/storage/epub-library", () => ({
  listUserEpubs: (user: User | null) => listUserEpubsMock(user),
}))

const userA = { id: "user-a" } as User
const userB = { id: "user-b" } as User

const BOOK: LibraryEpub = {
  id: "epub-1",
  title: "El Principito",
  fileName: "el-principito.epub",
  charCount: 12345,
  createdAt: 1,
  updatedAt: 1,
  coverImage: null,
  author: "Antoine de Saint-Exupéry",
}

describe("library-catalog", () => {
  beforeEach(async () => {
    listUserEpubsMock.mockReset()
    // Reset the module's private cache/in-flight state between tests.
    const { invalidateLibraryCache } = await import("@/lib/storage/library-catalog")
    invalidateLibraryCache()
  })

  describe("fetchLibraryCatalog / readCachedLibraryEpubs", () => {
    it("is a cache miss before anything has been fetched", async () => {
      const { readCachedLibraryEpubs } = await import("@/lib/storage/library-catalog")
      expect(readCachedLibraryEpubs(userA.id)).toBeNull()
    })

    it("populates the cache on first fetch and serves it synchronously after", async () => {
      listUserEpubsMock.mockResolvedValue([BOOK])
      const { fetchLibraryCatalog, readCachedLibraryEpubs } = await import(
        "@/lib/storage/library-catalog"
      )

      const items = await fetchLibraryCatalog(userA)
      expect(items).toEqual([BOOK])
      expect(readCachedLibraryEpubs(userA.id)).toEqual([BOOK])
    })

    it("dedupes a second concurrent call for the same user into one network request", async () => {
      let resolveFetch!: (v: LibraryEpub[]) => void
      listUserEpubsMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      )
      const { fetchLibraryCatalog } = await import("@/lib/storage/library-catalog")

      const first = fetchLibraryCatalog(userA)
      const second = fetchLibraryCatalog(userA)
      expect(listUserEpubsMock).toHaveBeenCalledTimes(1)

      resolveFetch([BOOK])
      expect(await first).toEqual([BOOK])
      expect(await second).toEqual([BOOK])
    })

    it("does not dedupe across different users", async () => {
      listUserEpubsMock.mockResolvedValueOnce([BOOK]).mockResolvedValueOnce([])
      const { fetchLibraryCatalog, readCachedLibraryEpubs } = await import(
        "@/lib/storage/library-catalog"
      )

      await fetchLibraryCatalog(userA)
      await fetchLibraryCatalog(userB)

      expect(listUserEpubsMock).toHaveBeenCalledTimes(2)
      expect(readCachedLibraryEpubs(userA.id)).toBeNull()
      expect(readCachedLibraryEpubs(userB.id)).toEqual([])
    })

    it("returns [] without touching the network or cache for a signed-out user", async () => {
      const { fetchLibraryCatalog, readCachedLibraryEpubs } = await import(
        "@/lib/storage/library-catalog"
      )
      const items = await fetchLibraryCatalog(null)
      expect(items).toEqual([])
      expect(listUserEpubsMock).not.toHaveBeenCalled()
      expect(readCachedLibraryEpubs(userA.id)).toBeNull()
    })
  })

  describe("writeCachedLibraryEpubs", () => {
    it("overwrites the cache for a user (e.g. after a local upload/delete)", async () => {
      const { writeCachedLibraryEpubs, readCachedLibraryEpubs } = await import(
        "@/lib/storage/library-catalog"
      )
      writeCachedLibraryEpubs(userA.id, [BOOK])
      expect(readCachedLibraryEpubs(userA.id)).toEqual([BOOK])

      writeCachedLibraryEpubs(userA.id, [])
      expect(readCachedLibraryEpubs(userA.id)).toEqual([])
    })
  })

  describe("invalidateLibraryCache", () => {
    it("clears a cached entry so it reads as a miss again", async () => {
      const { fetchLibraryCatalog, invalidateLibraryCache, readCachedLibraryEpubs } = await import(
        "@/lib/storage/library-catalog"
      )
      listUserEpubsMock.mockResolvedValue([BOOK])
      await fetchLibraryCatalog(userA)
      expect(readCachedLibraryEpubs(userA.id)).toEqual([BOOK])

      invalidateLibraryCache()
      expect(readCachedLibraryEpubs(userA.id)).toBeNull()
    })

    it("stops an in-flight fetch from repopulating the cache after a sign-out mid-request", async () => {
      let resolveFetch!: (v: LibraryEpub[]) => void
      listUserEpubsMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      )
      const { fetchLibraryCatalog, invalidateLibraryCache, readCachedLibraryEpubs } = await import(
        "@/lib/storage/library-catalog"
      )

      const pending = fetchLibraryCatalog(userA)
      invalidateLibraryCache() // simulates auth-context's sign-out handler firing mid-request
      resolveFetch([BOOK])
      await pending

      expect(readCachedLibraryEpubs(userA.id)).toBeNull()
    })
  })
})
