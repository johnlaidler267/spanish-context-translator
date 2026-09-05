import { describe, it, expect, beforeEach, vi } from "vitest"
import type { User } from "@supabase/supabase-js"

/**
 * Generic fluent mock for a `supabase.from(table)...` chain: every builder method just
 * records its call and returns the same builder, and the builder itself resolves (via
 * `.then`) to whatever `result` was configured for it -- mirrors the shape every method
 * along a real PostgrestFilterBuilder chain has (each is itself awaitable), without needing
 * a different hand-wired mock per method combination the way reading-progress-sync.test.ts's
 * simpler two-call chains do.
 */
function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "order", "insert", "delete", "single", "maybeSingle"]) {
    builder[method] = vi.fn(() => builder)
  }
  ;(builder as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => resolve(result)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    then: (resolve: (v: unknown) => void) => void
  }
}

let nextResult: { data: unknown; error: unknown } = { data: null, error: null }
let lastBuilder: ReturnType<typeof makeBuilder> | null = null
const fromMock = vi.fn((_table: string) => {
  lastBuilder = makeBuilder(nextResult)
  return lastBuilder
})

vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}))

const user = { id: "user-1" } as User

const LIST_ROW = {
  id: "epub-1",
  title: "Cien Años de Soledad",
  file_name: "cien-anos.epub",
  char_count: 850000,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
}

describe("epub-library", () => {
  beforeEach(() => {
    nextResult = { data: null, error: null }
    lastBuilder = null
    fromMock.mockClear()
  })

  describe("listUserEpubs", () => {
    it("returns [] without hitting the network for a signed-out user", async () => {
      const { listUserEpubs } = await import("@/lib/storage/epub-library")
      expect(await listUserEpubs(null)).toEqual([])
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("maps rows to camelCase LibraryEpub entries", async () => {
      nextResult = { data: [LIST_ROW], error: null }
      const { listUserEpubs } = await import("@/lib/storage/epub-library")
      const result = await listUserEpubs(user)
      expect(fromMock).toHaveBeenCalledWith("user_epubs")
      expect(result).toEqual([
        {
          id: "epub-1",
          title: "Cien Años de Soledad",
          fileName: "cien-anos.epub",
          charCount: 850000,
          createdAt: new Date("2024-01-01T00:00:00.000Z").getTime(),
          updatedAt: new Date("2024-01-02T00:00:00.000Z").getTime(),
        },
      ])
    })

    it("swallows a query error and returns []", async () => {
      nextResult = { data: null, error: { message: "boom" } }
      const { listUserEpubs } = await import("@/lib/storage/epub-library")
      expect(await listUserEpubs(user)).toEqual([])
    })
  })

  describe("saveEpubToLibrary", () => {
    it("returns null without hitting the network for a signed-out user", async () => {
      const { saveEpubToLibrary } = await import("@/lib/storage/epub-library")
      const result = await saveEpubToLibrary(null, { title: "X", fileName: "x.epub", text: "hola" })
      expect(result).toBeNull()
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("rejects text over the per-book size cap before ever calling Supabase", async () => {
      const { saveEpubToLibrary, EpubLibraryError, MAX_EPUB_LIBRARY_CHARS } = await import(
        "@/lib/storage/epub-library"
      )
      const text = "a".repeat(MAX_EPUB_LIBRARY_CHARS + 1)
      await expect(
        saveEpubToLibrary(user, { title: "Too Long", fileName: "long.epub", text }),
      ).rejects.toBeInstanceOf(EpubLibraryError)
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("inserts the book and returns its new id", async () => {
      nextResult = { data: { id: "new-epub-id" }, error: null }
      const { saveEpubToLibrary } = await import("@/lib/storage/epub-library")
      const result = await saveEpubToLibrary(user, {
        title: "El Principito",
        fileName: "el-principito.epub",
        text: "Había una vez...",
      })
      expect(result).toEqual({ id: "new-epub-id" })
      expect(fromMock).toHaveBeenCalledWith("user_epubs")
      expect(lastBuilder!.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "El Principito",
        file_name: "el-principito.epub",
        body_text: "Había una vez...",
        char_count: "Había una vez...".length,
      })
    })

    it("falls back to the filename (extension stripped) when the EPUB had no title", async () => {
      nextResult = { data: { id: "new-epub-id" }, error: null }
      const { saveEpubToLibrary } = await import("@/lib/storage/epub-library")
      await saveEpubToLibrary(user, { title: null, fileName: "mi-libro.epub", text: "texto" })
      expect(lastBuilder!.insert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "mi-libro" }),
      )
    })

    it("surfaces the library-full trigger error as EpubLibraryError", async () => {
      nextResult = {
        data: null,
        error: { message: "Your library is full (max 50 books). Delete a book before adding another." },
      }
      const { saveEpubToLibrary, EpubLibraryError } = await import("@/lib/storage/epub-library")
      await expect(
        saveEpubToLibrary(user, { title: "One More", fileName: "x.epub", text: "texto" }),
      ).rejects.toBeInstanceOf(EpubLibraryError)
    })

    it("swallows any other insert error and returns null", async () => {
      nextResult = { data: null, error: { message: "network blip" } }
      const { saveEpubToLibrary } = await import("@/lib/storage/epub-library")
      const result = await saveEpubToLibrary(user, { title: "X", fileName: "x.epub", text: "texto" })
      expect(result).toBeNull()
    })
  })

  describe("getUserEpubText", () => {
    it("returns null without hitting the network for a signed-out user", async () => {
      const { getUserEpubText } = await import("@/lib/storage/epub-library")
      expect(await getUserEpubText(null, "epub-1")).toBeNull()
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("returns the book's title and text", async () => {
      nextResult = { data: { title: "El Principito", body_text: "Había una vez..." }, error: null }
      const { getUserEpubText } = await import("@/lib/storage/epub-library")
      expect(await getUserEpubText(user, "epub-1")).toEqual({
        title: "El Principito",
        text: "Había una vez...",
      })
    })

    it("returns null when not found (RLS or bad id)", async () => {
      nextResult = { data: null, error: null }
      const { getUserEpubText } = await import("@/lib/storage/epub-library")
      expect(await getUserEpubText(user, "missing")).toBeNull()
    })
  })

  describe("deleteUserEpub", () => {
    it("returns false without hitting the network for a signed-out user", async () => {
      const { deleteUserEpub } = await import("@/lib/storage/epub-library")
      expect(await deleteUserEpub(null, "epub-1")).toBe(false)
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("returns true when a row was actually deleted", async () => {
      nextResult = { data: [{ id: "epub-1" }], error: null }
      const { deleteUserEpub } = await import("@/lib/storage/epub-library")
      expect(await deleteUserEpub(user, "epub-1")).toBe(true)
    })

    it("returns false when nothing matched (already gone / not this user's)", async () => {
      nextResult = { data: [], error: null }
      const { deleteUserEpub } = await import("@/lib/storage/epub-library")
      expect(await deleteUserEpub(user, "epub-1")).toBe(false)
    })

    it("returns false on a query error", async () => {
      nextResult = { data: null, error: { message: "boom" } }
      const { deleteUserEpub } = await import("@/lib/storage/epub-library")
      expect(await deleteUserEpub(user, "epub-1")).toBe(false)
    })
  })
})
