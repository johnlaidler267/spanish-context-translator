import { describe, expect, it } from "vitest"
import { DEMO_PASSAGES } from "@/lib/landing/demo-passages"

// Interaction (hover/tap, level and language switches, story button) is covered in the browser
// by tests/e2e/landing-demo.spec.ts; this checks the stored passages themselves.
describe("demo passages", () => {
  it("every passage's showcase phrase exists and has a meaning", () => {
    for (const byLevel of Object.values(DEMO_PASSAGES)) {
      for (const passage of Object.values(byLevel)) {
        expect(passage.chunks[passage.initial]?.meaning).toBeTruthy()
        for (const c of passage.chunks) expect(c.text.trim() && c.meaning.trim()).toBeTruthy()
      }
    }
  })
})

describe("demo passage text", () => {
  const join = (chunks: { text: string; after?: string }[]) => chunks.map((c) => c.text + (c.after ?? " ")).join("")
  it("reads back as the intended sentences", () => {
    expect(join(DEMO_PASSAGES.spanish.intermediate.chunks)).toBe(
      "Ayer mi hermana me dijo que le daba igual dónde cenar, pero cuando llegamos al restaurante puso el grito en el cielo porque estaba cerrado. Al final nos tocó pedir pizza y, la verdad, me supo a gloria.",
    )
    expect(join(DEMO_PASSAGES.french.intermediate.chunks)).toBe(
      "Hier, mon frère m'a dit que ça lui était égal où on dînait, mais quand on est arrivés au restaurant, il est tombé des nues : c'était fermé. Du coup, on a commandé une pizza et, franchement, elle était à tomber.",
    )
    expect(join(DEMO_PASSAGES.french.advanced.chunks)).toBe(
      "J'ai beau y réfléchir, je n'arrive pas à comprendre comment il s'en est sorti. Si j'avais su, je ne me serais jamais fourré dans ce pétrin.",
    )
  })
})
