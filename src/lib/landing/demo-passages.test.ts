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
