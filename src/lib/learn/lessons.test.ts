import { describe, expect, it } from "vitest"
import { conjugate } from "@/lib/learn/conjugation"
import { findLesson, LESSONS, parseInline } from "@/lib/learn/lessons"

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

  it("parseInline splits highlight and Spanish markup", () => {
    expect(parseInline("Si **tuviera** tiempo, _leería_.")).toEqual([
      { text: "Si " },
      { text: "tuviera", style: "highlight" },
      { text: " tiempo, " },
      { text: "leería", style: "spanish" },
      { text: "." },
    ])
    expect(parseInline("plain")).toEqual([{ text: "plain" }])
  })
})
