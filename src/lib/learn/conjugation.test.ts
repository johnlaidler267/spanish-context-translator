import { describe, expect, it } from "vitest"
import { conjugate, gradeConjugation, listTenses, normalizeAnswer, TENSE_IDS, verbForms } from "@/lib/learn/conjugation"
import { DRILL_VERBS, SENTENCE_BANK } from "@/lib/learn/drill-content"

describe("conjugate", () => {
  it("handles common irregulars", () => {
    expect(conjugate("tener", "preterite", 3)).toBe("tuvimos")
    expect(conjugate("ir", "imperfect", 3)).toBe("íbamos")
    expect(conjugate("decir", "future", 0)).toBe("diré")
    expect(conjugate("escribir", "perfect", 0)).toBe("he escrito")
    expect(conjugate("llegar", "subj", 5)).toBe("lleguen")
    expect(conjugate("saber", "impsubj", 2)).toBe("supiera")
  })

  it("knows every drill verb in every tense", () => {
    for (const { verb } of DRILL_VERBS) {
      const forms = verbForms(verb)
      expect(forms, verb).not.toBeNull()
      for (const t of TENSE_IDS) expect(forms![t].every((f) => f.length > 0), `${verb} ${t}`).toBe(true)
    }
  })

  it("resolves every sentence-bank item, with exactly one blank", () => {
    for (const s of SENTENCE_BANK) {
      expect(s.text.split("___"), s.text).toHaveLength(2)
      expect(conjugate(s.verb, s.tense, s.person), s.text).toBeTruthy()
    }
  })
})

describe("gradeConjugation", () => {
  it("accepts the exact form, with or without a subject pronoun and punctuation", () => {
    expect(gradeConjugation("tener", "preterite", 3, "tuvimos").kind).toBe("correct")
    expect(gradeConjugation("tener", "preterite", 3, "  Nosotros Tuvimos. ").kind).toBe("correct")
    expect(gradeConjugation("poder", "conditional", 1, "¿Podrías?").kind).toBe("correct")
  })

  it("counts a missing accent as right but says so", () => {
    expect(gradeConjugation("tener", "imperfect", 0, "tenia")).toEqual({ kind: "accent", answer: "tenía" })
  })

  it("names the tense when the form belongs to another tense", () => {
    expect(gradeConjugation("tener", "preterite", 0, "tenía")).toEqual({
      kind: "wrong-tense",
      answer: "tuve",
      tense: "imperfect",
    })
  })

  it("names the person when the form belongs to another person", () => {
    expect(gradeConjugation("tener", "preterite", 3, "tuvo")).toEqual({ kind: "wrong-person", answer: "tuvimos", person: 2 })
  })

  it("marks anything else wrong, including blank", () => {
    expect(gradeConjugation("tener", "preterite", 3, "tenimos").kind).toBe("wrong")
    expect(gradeConjugation("tener", "preterite", 3, "   ").kind).toBe("wrong")
  })
})

describe("helpers", () => {
  it("normalizeAnswer strips one leading subject pronoun only", () => {
    expect(normalizeAnswer("Ella  habla")).toBe("habla")
    expect(normalizeAnswer("he hablado")).toBe("he hablado")
  })

  it("listTenses reads naturally, in teaching order", () => {
    expect(listTenses(["imperfect", "present"])).toBe("present and imperfect")
    expect(listTenses(["present", "preterite", "imperfect"])).toBe("present, preterite and imperfect")
  })
})
