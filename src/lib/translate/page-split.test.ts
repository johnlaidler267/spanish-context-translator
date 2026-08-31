import { describe, it, expect } from "vitest"
import {
  pageCharCapForWordLimit,
  resolvePageSplitLimits,
  dedupeConsecutiveDuplicateLines,
  splitSourceIntoSentences,
  pageSourceText,
  buildSentencePages,
  splitSegmentIntoPageParts,
  mergeArticlePagesIfWholeTextFitsLimits,
  PAGE_SIZE_WORDS_MOBILE,
  PAGE_SIZE_WORDS_DESKTOP,
} from "@/lib/translate/page-split"

describe("pageCharCapForWordLimit / resolvePageSplitLimits", () => {
  it("derives the char cap as 24 chars per word", () => {
    expect(pageCharCapForWordLimit(100)).toBe(2400)
  })

  it("uses the mobile word count and its derived char cap on mobile", () => {
    expect(resolvePageSplitLimits(true)).toEqual({
      maxWords: PAGE_SIZE_WORDS_MOBILE,
      maxChars: pageCharCapForWordLimit(PAGE_SIZE_WORDS_MOBILE),
    })
  })

  it("uses the desktop word count on desktop", () => {
    expect(resolvePageSplitLimits(false)).toEqual({
      maxWords: PAGE_SIZE_WORDS_DESKTOP,
      maxChars: pageCharCapForWordLimit(PAGE_SIZE_WORDS_DESKTOP),
    })
  })
})

describe("dedupeConsecutiveDuplicateLines", () => {
  it("drops a line that's an exact whitespace-normalized repeat of the previous one", () => {
    expect(dedupeConsecutiveDuplicateLines("Pastora había nacido.\nPastora había nacido.\nOtra línea.")).toBe(
      "Pastora había nacido.\nOtra línea.",
    )
  })

  it("treats differing internal whitespace as the same line for dedup purposes", () => {
    expect(dedupeConsecutiveDuplicateLines("Hola  mundo\nHola mundo\nBien")).toBe("Hola  mundo\nBien")
  })

  it("does not drop non-consecutive repeats", () => {
    expect(dedupeConsecutiveDuplicateLines("A\nB\nA")).toBe("A\nB\nA")
  })

  it("does not collapse consecutive blank lines", () => {
    expect(dedupeConsecutiveDuplicateLines("Line one\n\n\nLine two")).toBe("Line one\n\n\nLine two")
  })

  it("leaves text with no duplicate lines untouched", () => {
    expect(dedupeConsecutiveDuplicateLines("Uno\nDos\nTres")).toBe("Uno\nDos\nTres")
  })
})

describe("splitSourceIntoSentences", () => {
  it("splits on sentence-ending punctuation", () => {
    const sentences = splitSourceIntoSentences("Hola mundo. ¿Cómo estás? Muy bien, gracias.")
    expect(sentences).toEqual(["Hola mundo.", "¿Cómo estás?", "Muy bien, gracias."])
  })

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitSourceIntoSentences("")).toEqual([])
    expect(splitSourceIntoSentences("   \n  ")).toEqual([])
  })

  it("keeps line-break-heavy text (lyrics/poems) as one segment instead of over-splitting", () => {
    const poem = "Verso uno\nVerso dos\nVerso tres\nVerso cuatro"
    expect(splitSourceIntoSentences(poem)).toEqual([poem])
  })
})

describe("splitSegmentIntoPageParts — stanza-preferring cuts", () => {
  it("cuts at the blank line between stanzas instead of mid-stanza when the budget forces a break", () => {
    const song = "Uno dos tres\n\nCuatro cinco seis"
    const parts = splitSegmentIntoPageParts(song, { maxWords: 4, maxChars: 1000 })
    expect(parts).toEqual(["Uno dos tres\n\n", "Cuatro cinco seis"])
  })

  it("falls back to a plain budget cut when no stanza boundary is available yet", () => {
    const noBreaks = "Uno dos tres cuatro cinco seis"
    const parts = splitSegmentIntoPageParts(noBreaks, { maxWords: 4, maxChars: 1000 })
    expect(parts).toEqual(["Uno dos tres cuatro", "cinco seis"])
  })
})

describe("pageSourceText", () => {
  it("joins pieces with a single space when neither side already has whitespace", () => {
    expect(pageSourceText(["Hola", "mundo"])).toBe("Hola mundo")
  })

  it("does not add an extra space when the previous piece already ends in whitespace", () => {
    expect(pageSourceText(["Hola ", "mundo"])).toBe("Hola mundo")
  })

  it("does not add a space across a newline boundary", () => {
    expect(pageSourceText(["Línea uno\n", "Línea dos"])).toBe("Línea uno\nLínea dos")
  })

  it("returns an empty string for no pieces, and the piece itself for one", () => {
    expect(pageSourceText([])).toBe("")
    expect(pageSourceText(["Solo"])).toBe("Solo")
  })
})

describe("buildSentencePages", () => {
  it("returns no pages for no sentences", () => {
    expect(buildSentencePages([], { maxWords: 10, maxChars: 200 })).toEqual([])
  })

  it("packs short sentences onto one page while under both limits", () => {
    const pages = buildSentencePages(["Uno dos.", "Tres cuatro.", "Cinco seis."], {
      maxWords: 20,
      maxChars: 200,
    })
    expect(pages).toEqual([["Uno dos.", "Tres cuatro.", "Cinco seis."]])
  })

  it("starts a new page once the word limit would be exceeded", () => {
    // 3 words each; maxWords: 5 -> first sentence (3) fits, second would make 6 > 5
    const pages = buildSentencePages(["Uno dos tres.", "Cuatro cinco seis."], {
      maxWords: 5,
      maxChars: 1000,
    })
    expect(pages).toEqual([["Uno dos tres."], ["Cuatro cinco seis."]])
  })
})

describe("mergeArticlePagesIfWholeTextFitsLimits", () => {
  const limits = { maxWords: 100, maxChars: 2000 }

  it("passes through multiple non-empty pages unchanged", () => {
    const pages = [["Page one."], ["Page two."]]
    expect(mergeArticlePagesIfWholeTextFitsLimits(pages, limits, "Page one. Page two.")).toEqual(pages)
  })

  it("collapses a single non-empty page's own content (drops empty pieces first)", () => {
    const pages = [["", "Only real content.", ""]]
    expect(mergeArticlePagesIfWholeTextFitsLimits(pages, limits, "Only real content.")).toEqual([
      ["Only real content."],
    ])
  })

  it("falls back to the full source text when every page is empty", () => {
    const pages: string[][] = [[], []]
    expect(mergeArticlePagesIfWholeTextFitsLimits(pages, limits, "  Fallback   text  ")).toEqual([
      ["Fallback text"],
    ])
  })

  it("returns an empty page when both the pages and the full text are empty", () => {
    expect(mergeArticlePagesIfWholeTextFitsLimits([], limits, "")).toEqual([[]])
  })
})
