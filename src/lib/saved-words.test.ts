import { describe, expect, it } from "vitest"
import { canSaveWords, savedWordKey, sentenceAround } from "@/lib/saved-words"
import type { User } from "@supabase/supabase-js"

describe("sentenceAround", () => {
  const text = "El zorro corría por el bosque. De repente, se detuvo junto al río! Luego siguió."

  it("returns the sentence containing the word", () => {
    expect(sentenceAround(text, "detuvo")).toBe("De repente, se detuvo junto al río!")
    expect(sentenceAround(text, "zorro")).toBe("El zorro corría por el bosque.")
    expect(sentenceAround(text, "siguió")).toBe("Luego siguió.")
  })

  it("stops at the chunk's own closing punctuation instead of running into the next sentence", () => {
    expect(sentenceAround("Hola. Adiós.", "Hola.")).toBe("Hola.")
    expect(sentenceAround("Hola. Adiós.", "Adiós.")).toBe("Adiós.")
  })

  it("matches case-insensitively and collapses whitespace", () => {
    expect(sentenceAround("Hola.\n\n  ADIÓS   amigo.", "adiós")).toBe("ADIÓS amigo.")
  })

  it("falls back to the start of the text when the word isn't found, capped in length", () => {
    const long = "palabra ".repeat(100).trim()
    const out = sentenceAround(long, "zzz")
    expect(out.length).toBeLessThanOrEqual(300)
    expect(out.endsWith("…")).toBe(true)
  })
})

describe("savedWordKey / canSaveWords", () => {
  it("treats case and surrounding spaces as the same word", () => {
    expect(savedWordKey("  Hola ")).toBe(savedWordKey("hola"))
  })

  it("only lets real (non-anonymous) accounts save", () => {
    expect(canSaveWords(null)).toBe(false)
    expect(canSaveWords({ id: "a", is_anonymous: true } as User)).toBe(false)
    expect(canSaveWords({ id: "a", is_anonymous: false } as User)).toBe(true)
  })
})
