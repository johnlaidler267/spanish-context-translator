import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * Covers `publishDiscoverResource` -- the insert shared by the Discover page's own "Upload
 * Resource" flow and the Library page's "Publish to Discover" flow (see
 * src/pages/discover/index.tsx and src/pages/library/index.tsx). Both call this one function so
 * a My Library book pushed to Discover ends up with the exact same row shape as a resource typed
 * straight into the curator upload form -- this test locks that shape down (derived
 * estimated_time, tag/cover fallbacks, and the LIST_SELECT mapping back to a ContentItem) plus
 * the DB-error passthrough both callers rely on to show a message instead of silently no-opping.
 */

function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "insert", "single"]) {
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

const BASE_RESOURCE = {
  title: "Cien años de soledad",
  author: "Gabriel García Márquez",
  language: "Spanish",
  type: "book" as const,
  difficulty: "advanced" as const,
  text: "Muchos años después, frente al pelotón de fusilamiento...",
  tags: [] as string[],
  wordCount: 420,
}

describe("publishDiscoverResource", () => {
  beforeEach(() => {
    nextResult = { data: null, error: null }
    lastBuilder = null
    fromMock.mockClear()
  })

  it("inserts into discover_items with a derived estimated_time and a default tag/cover when none were given", async () => {
    nextResult = {
      data: {
        id: "new-id",
        title: BASE_RESOURCE.title,
        author: BASE_RESOURCE.author,
        type: BASE_RESOURCE.type,
        difficulty: BASE_RESOURCE.difficulty,
        word_count: BASE_RESOURCE.wordCount,
        language: BASE_RESOURCE.language,
        cover_image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop",
        tags: ["Book"],
        preview: BASE_RESOURCE.text.slice(0, 800),
        estimated_time: "3 min",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    }

    const { publishDiscoverResource } = await import("@/lib/discover/discover-catalog")
    const result = await publishDiscoverResource(BASE_RESOURCE)

    expect(fromMock).toHaveBeenCalledWith("discover_items")
    expect(lastBuilder?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: BASE_RESOURCE.title,
        // 420 words / 200 wpm -> 3 min, well under the 60-min "hours" cutover.
        estimated_time: "3 min",
        // No tags given -> falls back to the Title Case of the content type.
        tags: ["Book"],
        // No cover given -> falls back to the shared placeholder cover.
        cover_image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop",
        preview: BASE_RESOURCE.text.slice(0, 800),
        body_text: BASE_RESOURCE.text,
      }),
    )
    expect("item" in result && result.item.id).toBe("new-id")
    expect("item" in result && result.item.tags).toEqual(["Book"])
  })

  it("keeps explicit tags and cover image instead of the fallbacks", async () => {
    nextResult = {
      data: {
        id: "new-id-2",
        title: BASE_RESOURCE.title,
        author: BASE_RESOURCE.author,
        type: BASE_RESOURCE.type,
        difficulty: BASE_RESOURCE.difficulty,
        word_count: BASE_RESOURCE.wordCount,
        language: BASE_RESOURCE.language,
        cover_image: "https://example.com/cover.jpg",
        tags: ["Magic Realism", "Epic"],
        preview: BASE_RESOURCE.text.slice(0, 800),
        estimated_time: "3 min",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    }

    const { publishDiscoverResource } = await import("@/lib/discover/discover-catalog")
    await publishDiscoverResource({
      ...BASE_RESOURCE,
      tags: ["Magic Realism", "Epic"],
      coverImage: "https://example.com/cover.jpg",
    })

    expect(lastBuilder?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["Magic Realism", "Epic"],
        cover_image: "https://example.com/cover.jpg",
      }),
    )
  })

  it("rounds up to hours once the estimate crosses 60 minutes", async () => {
    nextResult = { data: { id: "x", tags: [], preview: "", estimated_time: "9 hours", created_at: "" }, error: null }
    const { publishDiscoverResource } = await import("@/lib/discover/discover-catalog")
    await publishDiscoverResource({ ...BASE_RESOURCE, wordCount: 100_000 })
    expect(lastBuilder?.insert).toHaveBeenCalledWith(expect.objectContaining({ estimated_time: "9 hours" }))
  })

  it("surfaces a DB/RLS error instead of throwing (e.g. a non-curator account)", async () => {
    nextResult = { data: null, error: { message: "new row violates row-level security policy" } }
    const { publishDiscoverResource } = await import("@/lib/discover/discover-catalog")
    const result = await publishDiscoverResource(BASE_RESOURCE)
    expect(result).toEqual({ error: "new row violates row-level security policy" })
  })
})
