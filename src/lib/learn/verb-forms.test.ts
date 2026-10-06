import { Conjugator } from "@jirimracek/conjugate-esp"
import { describe, expect, it } from "vitest"
import { TENSE_IDS, type TenseId } from "@/lib/learn/conjugation"
import { DRILL_VERBS } from "@/lib/learn/drill-content"

// Where each tense lives in the library's result table.
const LIBRARY_KEYS: Record<Exclude<TenseId, "imperative">, ["Indicativo" | "Subjuntivo", string]> = {
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
      const forms: Record<string, string[]> = Object.fromEntries(
        TENSE_IDS.filter((t) => t !== "imperative").map((t) => {
          const [mood, tense] = LIBRARY_KEYS[t as Exclude<TenseId, "imperative">]
          const row = table[mood]?.[tense]
          if (!Array.isArray(row) || row.length !== 6) throw new Error(`${verb}: no ${t} forms`)
          return [t, row]
        }),
      )
      // The library's affirmative imperative has "-" for yo, él and ellos; the usted/ustedes
      // commands are the present subjunctive forms, so they're filled in from there.
      const command = table.Imperativo?.Afirmativo
      if (!Array.isArray(command) || command.length !== 6) throw new Error(`${verb}: no imperative forms`)
      forms.imperative = ["", command[1], forms.subj[2], command[3], command[4], forms.subj[5]]
      return `  ${JSON.stringify(verb)}: ${JSON.stringify(forms)}`
    })
    await expect(`{\n${lines.join(",\n")}\n}\n`).toMatchFileSnapshot("./verb-forms.json")
  })
})
