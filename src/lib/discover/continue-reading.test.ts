import { describe, it, expect } from "vitest"
import { buildContinueReadingItems } from "@/lib/discover/continue-reading"
import type { ContentItem } from "@/lib/discover/content-data"
import type { LibraryEpub } from "@/lib/storage/epub-library"
import type { RecentlyViewedEntry } from "@/lib/storage/reading-progress-storage"

// Landing page's Continue Reading row must interleave Discover catalog items and the reader's
// own uploaded library books by actual last-read recency (whichever 5 they touched most
// recently), not show Discover items first -- see landing-continue-reading.tsx.

function discoverItem(id: string): ContentItem {
  return {
    id,
    title: `Discover ${id}`,
    author: "Some Author",
    type: "book",
    difficulty: "beginner",
    wordCount: 1000,
    language: "Spanish",
    coverImage: "",
    tags: [],
    preview: "preview text",
    estimatedTime: "10 min",
  }
}

function libraryBook(id: string): LibraryEpub {
  return {
    id,
    title: `Library ${id}`,
    fileName: `${id}.epub`,
    charCount: 5000,
    createdAt: 0,
    updatedAt: 0,
    coverImage: null,
    author: null,
    description: null,
  }
}

function entry(contentId: string, updatedAt: number, pageIndex = 2, totalPages = 10): RecentlyViewedEntry {
  return { contentId, pageIndex, totalPages, updatedAt }
}

describe("buildContinueReadingItems", () => {
  it("interleaves a discover item and a personal upload by recency, most recent first", () => {
    const catalog = [discoverItem("d1")]
    const library = [libraryBook("u1")]
    // u1 was touched more recently than d1, so it must come first even though it's a personal
    // upload rather than a Discover item.
    const recent = [entry("u1", 2000), entry("d1", 1000)]

    const items = buildContinueReadingItems(recent, catalog, library, 5)

    expect(items).toEqual([
      { kind: "library", book: library[0], percent: 30 },
      { kind: "discover", content: catalog[0], percent: 30 },
    ])
  })

  it("caps the result at `limit`, keeping only the most recent entries", () => {
    const catalog = [discoverItem("d1"), discoverItem("d2"), discoverItem("d3")]
    const library = [libraryBook("u1"), libraryBook("u2"), libraryBook("u3")]
    const recent = [
      entry("u1", 6000),
      entry("d1", 5000),
      entry("u2", 4000),
      entry("d2", 3000),
      entry("u3", 2000),
      entry("d3", 1000),
    ]

    const items = buildContinueReadingItems(recent, catalog, library, 5)

    expect(items).toHaveLength(5)
    expect(items.map((i) => (i.kind === "library" ? i.book.id : i.content.id))).toEqual([
      "u1",
      "d1",
      "u2",
      "d2",
      "u3",
    ])
  })

  it("skips entries whose content no longer exists in either source, without counting against the cap", () => {
    const catalog = [discoverItem("d1")]
    const library = [libraryBook("u1")]
    const recent = [
      entry("deleted-book", 3000),
      entry("u1", 2000),
      entry("d1", 1000),
    ]

    const items = buildContinueReadingItems(recent, catalog, library, 5)

    expect(items.map((i) => (i.kind === "library" ? i.book.id : i.content.id))).toEqual(["u1", "d1"])
  })

  it("reports null percent when no page total was ever recorded", () => {
    const library = [libraryBook("u1")]
    const recent: RecentlyViewedEntry[] = [{ contentId: "u1", pageIndex: 0, updatedAt: 1000 }]

    const items = buildContinueReadingItems(recent, [], library, 5)

    expect(items).toEqual([{ kind: "library", book: library[0], percent: null }])
  })
})
