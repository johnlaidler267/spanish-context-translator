import { Conjugator } from "@jirimracek/conjugate-esp"
import { describe, expect, it } from "vitest"
import { TENSE_IDS, type TenseId } from "@/lib/learn/conjugation"
import { DRILL_VERBS } from "@/lib/learn/drill-content"

// Where each tense lives in the library's result table.
const LIBRARY_KEYS: Record<TenseId, ["Indicativo" | "Subjuntivo", string]> = {
  present: ["Indicativo", "Presente"],
  preterite: ["Indicativo", "PreteritoIndefinido"],
  imperfect: ["Indicativo", "PreteritoImperfecto"],
  perfect: ["Indicativo", "PreteritoPerfecto"],
  future: ["Indicativo", "FuturoImperfecto"],
  conditional: ["Indicativo", "CondicionalSimple"],
  subj: ["Subjuntivo", "Presente"],
  impsubj: ["Subjuntivo", "PreteritoImperfectoRa"],
}

describe("verb-forms.json", () => {
  // The app reads drill verbs' forms from verb-forms.json instead of shipping the whole library.
  // This rebuilds the table from the library: run `npx vitest run -u` after changing DRILL_VERBS.
  it("matches the conjugation library for every drill verb", async () => {
    const conjugator = new Conjugator()
    conjugator.useHighlight(false)
    const lines = DRILL_VERBS.map(({ verb }) => {
      const result = conjugator.conjugateSync(verb, "castellano")
      if (!Array.isArray(result)) throw new Error(`Library doesn't know ${verb}: ${result}`)
      const table = result[0].conjugation as unknown as Record<string, Record<string, string[]>>
      const forms = Object.fromEntries(
        TENSE_IDS.map((t) => {
          const [mood, tense] = LIBRARY_KEYS[t]
          const row = table[mood]?.[tense]
          if (!Array.isArray(row) || row.length !== 6) throw new Error(`${verb}: no ${t} forms`)
          return [t, row]
        }),
      )
      return `  ${JSON.stringify(verb)}: ${JSON.stringify(forms)}`
    })
    await expect(`{\n${lines.join(",\n")}\n}\n`).toMatchFileSnapshot("./verb-forms.json")
  })
})
