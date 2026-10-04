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

  it("the si-clause lesson's typed answers are the forms it teaches", () => {
    const typed = findLesson("si-clauses")!.steps.flatMap((s) => (s.kind === "type" ? [conjugate(s.verb, s.tense, s.person)] : []))
    expect(typed).toEqual(["viviéramos", "pudiera", "comería"])
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
