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
  resumeExcerptFromPageSource,
  computePageStartSentenceIndices,
  findPageIndexForSentenceIndex,
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

describe("resumeExcerptFromPageSource", () => {
  it("returns the page verbatim when it's already within the word cap", () => {
    expect(resumeExcerptFromPageSource(["Había una vez un principito.", "Vivía en un asteroide."])).toBe(
      "Había una vez un principito. Vivía en un asteroide.",
    )
  })

  it("truncates to the first 16 words with a trailing ellipsis when the page is longer", () => {
    const words = Array.from({ length: 40 }, (_, i) => `palabra${i}`)
    const result = resumeExcerptFromPageSource([words.join(" ")])
    expect(result).toBe(`${words.slice(0, 16).join(" ")}…`)
  })

  it("collapses newlines/whitespace so the excerpt reads as one line", () => {
    expect(resumeExcerptFromPageSource(["Primera línea.\n\nSegunda   línea."])).toBe(
      "Primera línea. Segunda línea.",
    )
  })

  it("returns an empty string for an empty/blank page", () => {
    expect(resumeExcerptFromPageSource([])).toBe("")
    expect(resumeExcerptFromPageSource(["   "])).toBe("")
  })
})

describe("computePageStartSentenceIndices / findPageIndexForSentenceIndex", () => {
  it("maps each page to the sentence its content starts in, one sentence per page", () => {
    const sentences = ["Uno dos tres.", "Cuatro cinco seis.", "Siete ocho nueve."]
    const pages = [["Uno dos tres."], ["Cuatro cinco seis."], ["Siete ocho nueve."]]
    expect(computePageStartSentenceIndices(sentences, pages)).toEqual([0, 1, 2])
  })

  it("maps a page holding multiple whole sentences to the first of them", () => {
    const sentences = ["Uno.", "Dos.", "Tres.", "Cuatro."]
    // Two sentences per page.
    const pages = [
      ["Uno.", "Dos."],
      ["Tres.", "Cuatro."],
    ]
    expect(computePageStartSentenceIndices(sentences, pages)).toEqual([0, 2])
  })

  it("attributes a page starting mid-sentence (a long sentence split across pages) to that sentence", () => {
    const longSentence = Array.from({ length: 20 }, (_, i) => `palabra${i}`).join(" ") + "."
    const sentences = ["Corta.", longSentence, "Final."]
    // Simulate splitSegmentIntoPageParts breaking the long sentence into two pieces across pages.
    const words = longSentence.replace(/\.$/, "").split(" ")
    const firstHalf = words.slice(0, 10).join(" ")
    const secondHalf = words.slice(10).join(" ") + "."
    const pages = [["Corta.", firstHalf], [secondHalf], ["Final."]]
    // All three pages fall within sentence index 1 (the long one) except the first and last.
    expect(computePageStartSentenceIndices(sentences, pages)).toEqual([0, 1, 2])
  })

  it("is stable when a real-fit reflow pass moves content between pages (order preserved)", () => {
    const sentences = ["Uno dos.", "Tres cuatro cinco.", "Seis siete ocho nueve."]
    // Suppose the char/word estimate originally put all three on one page, but a real-fit pass
    // later moved the last sentence forward onto its own page.
    const pages = [["Uno dos.", "Tres cuatro cinco."], ["Seis siete ocho nueve."]]
    expect(computePageStartSentenceIndices(sentences, pages)).toEqual([0, 2])
  })

  it("returns one entry per page, all 0, for an empty sentence array", () => {
    expect(computePageStartSentenceIndices([], [["a"], ["b"]])).toEqual([0, 0])
  })

  it("returns an empty array for no pages", () => {
    expect(computePageStartSentenceIndices(["Uno."], [])).toEqual([])
  })

  it("finds the last page whose start is at or before the target sentence index", () => {
    const starts = [0, 2, 5, 9]
    expect(findPageIndexForSentenceIndex(starts, 0)).toBe(0)
    expect(findPageIndexForSentenceIndex(starts, 1)).toBe(0)
    expect(findPageIndexForSentenceIndex(starts, 2)).toBe(1)
    expect(findPageIndexForSentenceIndex(starts, 4)).toBe(1)
    expect(findPageIndexForSentenceIndex(starts, 5)).toBe(2)
    expect(findPageIndexForSentenceIndex(starts, 100)).toBe(3)
  })

  it("clamps below the first page's start to page 0", () => {
    expect(findPageIndexForSentenceIndex([3, 7], 0)).toBe(0)
  })

  it("returns 0 for an empty starts array", () => {
    expect(findPageIndexForSentenceIndex([], 5)).toBe(0)
  })

  it("round-trips through buildSentencePages: every page's real content maps back to itself", () => {
    const sentences = [
      "El sol brillaba sobre el valle.",
      "Los pájaros cantaban una melodía suave.",
      "María caminaba despacio por el sendero.",
      "El viento movía las hojas de los árboles.",
      "Al final del camino había una pequeña casa.",
    ]
    const pages = buildSentencePages(sentences, { maxWords: 8, maxChars: 200 })
    const starts = computePageStartSentenceIndices(sentences, pages)
    expect(starts.length).toBe(pages.length)
    // Monotonically non-decreasing -- reading order is never reversed.
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]!)
    }
    // Resuming at each page's own start sentence must land back on that same page.
    for (let i = 0; i < starts.length; i++) {
      expect(findPageIndexForSentenceIndex(starts, starts[i]!)).toBe(i)
    }
  })
})
