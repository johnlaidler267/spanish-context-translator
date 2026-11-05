import { describe, expect, it } from "vitest"
import { conjugate } from "@/lib/learn/conjugation"
import { findLesson, LESSON_LEVELS, LESSONS, lessonsFor, parseInline } from "@/lib/learn/lessons"

describe("lessons", () => {
  it("every step is answerable: one blank, one right choice, typed answers that conjugate", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind === "choice") {
          expect(step.text.split("___"), step.text).toHaveLength(2)
          expect(step.options.filter((o) => o.right), step.text).toHaveLength(1)
        }
        if (step.kind === "type") {
          expect(step.text.split("___"), step.text).toHaveLength(2)
          expect(conjugate(step.verb, step.tense, step.person), step.text).toBeTruthy()
        }
      }
    }
  })

  it("typed answers are the forms each lesson teaches", () => {
    const typed = (id: string) =>
      findLesson(id)!.steps.flatMap((s) => (s.kind === "type" ? [conjugate(s.verb, s.tense, s.person)] : []))
    expect(typed("ser-estar")).toEqual(["son", "están"])
    expect(typed("preterite-imperfect")).toEqual(["llamó", "llevaban", "llegué"])
    expect(typed("por-para")).toEqual([])
    expect(typed("ojala")).toEqual(["estés", "vuelvan", "supiera"])
    expect(typed("si-clauses")).toEqual(["viviéramos", "pudiera", "comería"])
  })

  it("lesson ids are unique, and each opens by teaching", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
    for (const l of LESSONS) expect(l.steps[0].kind, l.id).toBe("teach")
  })

  it("lessons run easiest first, so each level's group stays in suggested order", () => {
    for (const learning of ["spanish", "french"] as const) {
      const ranks = lessonsFor(learning).map((l) => LESSON_LEVELS.indexOf(l.level))
      expect(ranks, learning).toEqual([...ranks].sort((a, b) => a - b))
    }
  })

  it("each learning language gets only its own lessons", () => {
    expect(lessonsFor("spanish").map((l) => l.id)).toEqual(["ser-estar", "por-para", "preterite-imperfect", "ojala", "si-clauses"])
    expect(lessonsFor("french").map((l) => l.id)).toEqual(["fr-tu-vous", "fr-articles", "fr-negation", "fr-au-du"])
    expect(lessonsFor("english")).toEqual([])
    for (const learning of ["spanish", "french"] as const) {
      for (const l of lessonsFor(learning)) expect(l.language, l.id).toBe(learning)
    }
  })

  it("French lessons never use typed steps or drills, which grade against Spanish verbs", () => {
    for (const l of lessonsFor("french")) {
      expect(l.steps.some((s) => s.kind === "type"), l.id).toBe(false)
      expect(l.finish.drill, l.id).toBeUndefined()
    }
  })

  it("parseInline splits highlight and Spanish markup", () => {
    expect(parseInline("Si **tuviera** tiempo, _leería_.")).toEqual([
      { text: "Si " },
      { text: "tuviera", style: "highlight" },
      { text: " tiempo, " },
      { text: "leería", style: "target" },
      { text: "." },
    ])
    expect(parseInline("plain")).toEqual([{ text: "plain" }])
  })
})
