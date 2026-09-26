import { describe, expect, it } from "vitest"
import type { LanguageLearningPreferences } from "@/lib/storage/language-learning-preferences"
import { buildChunkSortMessages } from "@/lib/translate/chunk-sort-prompt"
import { chunkReplyToItems } from "@/lib/translate/translate-page"

const PAIRS: LanguageLearningPreferences[] = [
  { learning: "spanish", native: "english" },
  { learning: "french", native: "english" },
  { learning: "english", native: "french" },
  { learning: "english", native: "spanish" },
]

/** Pull the worked example (TEXT + JSON) back out of the system prompt the model sees. */
function exampleFromSystemPrompt(system: string): { text: string; json: string } {
  const m = system.match(/EXAMPLE\nTEXT:\n([\s\S]+?)\n\nOutput:\n(\[[\s\S]+?\n\])/)
  if (!m) throw new Error("worked example not found in system prompt")
  return { text: m[1]!, json: m[2]! }
}

describe("buildChunkSortMessages", () => {
  it.each(PAIRS)("worked example for $learning→$native covers its sentence exactly", (prefs) => {
    const { system } = buildChunkSortMessages("x", prefs)
    const { text, json } = exampleFromSystemPrompt(system)
    const items = chunkReplyToItems(json, text)
    // Everything the chunks don't cover must be whitespace or punctuation — a mismatch here
    // means the example teaches the model a `c` that isn't an exact span of the sentence.
    const leftover = items
      .filter((i) => i.type === "text")
      .map((i) => i.text)
      .join("")
    expect(leftover).toMatch(/^[\s.,;:!?¡¿]*$/)
  })

  it("keeps the source text and hints in the user message, rules in the system message", () => {
    const { system, user } = buildChunkSortMessages("Lo hizo, por supuesto.", {
      learning: "spanish",
      native: "english",
    })
    expect(user).toContain('["por supuesto"]')
    expect(user.endsWith("TEXT:\nLo hizo, por supuesto.")).toBe(true)
    expect(system).toContain("gloss each chunk in English")
    expect(system).not.toContain("Lo hizo")
  })
})
