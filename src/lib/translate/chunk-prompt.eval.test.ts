/**
 * Live A/B eval of the translate chunking prompt against real Gemini. Skipped unless
 * GEMINI_API_KEY is set, so `npm run test` never hits the network.
 *
 *   GEMINI_API_KEY=… npx vitest run src/lib/translate/chunk-prompt.eval.test.ts
 *
 * Optional: GEMINI_EVAL_MODEL (default gemini-2.5-flash-lite), EVAL_OUT (JSON dump path).
 * Scores are mechanical (grouping + coverage); meanings are dumped to EVAL_OUT for eyeballing.
 */
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"
import { formatSubstringChunkRulesForPrompt } from "@/config/chunk-group-hints"
import { buildChunkSortMessages } from "@/lib/translate/chunk-sort-prompt"
import { normalizeChunkingSource } from "@/lib/translate/chunk-reconcile"
import { chunkReplyToItems } from "@/lib/translate/translate-page"
import type { ReconciledItem } from "@/lib/translate/types"

const API_KEY = process.env.GEMINI_API_KEY ?? ""
const MODEL = process.env.GEMINI_EVAL_MODEL || "gemini-2.5-flash-lite"

/** Frozen copy of the Spanish prompt before the Sep 2026 rewrite — the baseline. */
const OLD_SPANISH_PREFIX = `Sort following spanish text into logical chunks.

Chunks should consist of a singular word or multiple words ONLY IF they  fall into any of the following categories.

fixed_idioms: e.g. dar su brazo a torcer, a punto de
relative_subordinating_connectors: e.g. mientras que
lo_nominalizer: e.g. lo maravilloso
prepositional_verb_phrases: e.g. darse cuenta de que
possessive_pronouns: e.g. el suyo
proper_nouns: e.g. Buenos Aires,
clitic_clusters: e.g. se lo
reciprocal/distributive_pronoun_phrase: e.g. unos a otros
adverbial_phrases: e.g. por supuesto
colloquial_fixed_expressions: e.g. pinta bien
ETC.

For EACH word in context, ask, can this word be SINGULAR (Best) Or IS IT ABSOLUTELY NECESSARY to GROUP with its NEIGHBOR?

FORMAT: {"c": exact source substring, "m": English meaning, "l": literal rendering (even if unnatural), "n": tricky grammar help: omit if obvious}

Reply with only a JSON array of those objects (no markdown fences, no explanation). First character must be "[".

`

type GoldCase = {
  text: string
  /** Spans that should come back as exactly one chunk. */
  groups: string[]
  /** Spans that should NOT sit inside a single chunk (over-grouping). */
  split: string[]
}

const GOLD: GoldCase[] = [
  { text: "Estaba a punto de salir cuando sonó el teléfono.", groups: ["a punto de"], split: ["el teléfono"] },
  {
    text: "Sin embargo, a pesar de la lluvia, fuimos a la playa.",
    groups: ["Sin embargo", "a pesar de"],
    split: ["la lluvia", "la playa"],
  },
  {
    text: "De vez en cuando me acuerdo de lo feliz que era de niño.",
    groups: ["De vez en cuando", "me acuerdo de", "lo feliz"],
    split: ["que era"],
  },
  { text: "No te preocupes, ya se lo he explicado a mi hermano.", groups: ["se lo"], split: ["mi hermano"] },
  { text: "Hace falta más tiempo para terminar el proyecto.", groups: ["Hace falta"], split: ["más tiempo", "el proyecto"] },
  {
    text: "Al cabo de unos días, se dio cuenta de que nadie la esperaba.",
    groups: ["Al cabo de", "se dio cuenta de que"],
    split: ["unos días"],
  },
  { text: "Los vecinos se ayudan unos a otros cuando hay problemas.", groups: ["unos a otros"], split: ["Los vecinos"] },
  { text: "Lo mejor de vivir en Buenos Aires es la comida.", groups: ["Lo mejor", "Buenos Aires"], split: ["la comida"] },
  { text: "Tu idea pinta bien, pero la mía es más barata.", groups: ["pinta bien", "la mía"], split: ["Tu idea", "más barata"] },
  { text: "Por supuesto que iremos, siempre y cuando no llueva.", groups: ["Por supuesto", "siempre y cuando"], split: ["no llueva"] },
  {
    text: "En cuanto a los precios, cada día más caros, nadie dice nada.",
    groups: ["En cuanto a", "cada día más"],
    split: ["los precios", "dice nada"],
  },
  {
    text: "Mi abuela tiene una casa grande con un jardín precioso.",
    groups: [],
    split: ["Mi abuela", "una casa", "casa grande", "un jardín", "jardín precioso"],
  },
  {
    text: "Tardó mucho en darse cuenta, pero al final dio su brazo a torcer.",
    groups: ["darse cuenta", "al final", "dio su brazo a torcer"],
    split: [],
  },
  { text: "Dejó de fumar hace dos años y ahora se siente mucho mejor.", groups: ["Dejó de"], split: [] },
]

/** Same response schema `gemini-chat` sends for `gemini_response_schema: "chunk_rows"`. */
const CHUNK_ROWS_RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { c: { type: "string" }, m: { type: "string" }, l: { type: "string" }, n: { type: "string" } },
    required: ["c", "m"],
  },
}

type Usage = { input: number; output: number }

async function callGemini(system: string, user: string): Promise<{ text: string; usage: Usage }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 6000,
      responseMimeType: "application/json",
      responseSchema: CHUNK_ROWS_RESPONSE_SCHEMA,
    },
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
    })
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    return {
      text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      usage: {
        input: data.usageMetadata?.promptTokenCount ?? 0,
        output: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    }
  }
}

type CaseScore = {
  groupHits: number
  groupTotal: number
  splitViolations: string[]
  missedGroups: string[]
  /** Share of letters left as untranslated plain text. */
  uncovered: number
  error?: string
  usage: Usage
  chunks: Array<{ c: string; m: string; l?: string; n?: string }>
}

function letters(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length
}

/** Chunks carry glued trailing punctuation/space ("Sin embargo, "); compare the words only. */
function spanKey(s: string): string {
  return s.replace(/^[\s¡¿"«]+|[\s.,;:!?"»]+$/gu, "").toLowerCase()
}

function score(gold: GoldCase, items: ReconciledItem[], usage: Usage): CaseScore {
  const chunks = items.flatMap((i) =>
    i.type === "chunk" ? [{ c: i.chunk, m: i.meaning, l: i.literal, n: i.note }] : [],
  )
  const spans = new Set(chunks.map((c) => spanKey(c.c)))
  const missedGroups = gold.groups.filter((g) => !spans.has(spanKey(g)))
  const splitViolations = gold.split.filter((s) =>
    chunks.some((c) => c.c.toLowerCase().includes(s.toLowerCase())),
  )
  const plain = items.map((i) => (i.type === "text" ? i.text : "")).join("")
  return {
    groupHits: gold.groups.length - missedGroups.length,
    groupTotal: gold.groups.length,
    missedGroups,
    splitViolations,
    uncovered: letters(plain) / Math.max(1, letters(gold.text)),
    usage,
    chunks,
  }
}

type PromptBuilder = (canonical: string) => { system: string; user: string }

const PROMPTS: Record<string, PromptBuilder> = {
  old: (canonical) => {
    const hints = formatSubstringChunkRulesForPrompt(canonical)
    return { system: "", user: `${OLD_SPANISH_PREFIX}${hints ? `${hints}\n\n` : ""}TEXT:\n${canonical}` }
  },
  new: (canonical) => buildChunkSortMessages(canonical, { learning: "spanish", native: "english" }),
}

async function runPrompt(build: PromptBuilder): Promise<CaseScore[]> {
  const out: CaseScore[] = []
  for (const gold of GOLD) {
    const canonical = normalizeChunkingSource(gold.text)
    const { system, user } = build(canonical)
    const { text, usage } = await callGemini(system, user)
    try {
      out.push(score(gold, chunkReplyToItems(text, canonical), usage))
    } catch (e) {
      out.push({
        groupHits: 0,
        groupTotal: gold.groups.length,
        missedGroups: gold.groups,
        splitViolations: [],
        uncovered: 1,
        error: e instanceof Error ? e.message : String(e),
        usage,
        chunks: [],
      })
    }
  }
  return out
}

function summarize(name: string, scores: CaseScore[]) {
  const sum = (f: (s: CaseScore) => number) => scores.reduce((a, s) => a + f(s), 0)
  return {
    prompt: name,
    "groups found": `${sum((s) => s.groupHits)}/${sum((s) => s.groupTotal)}`,
    "over-groupings": sum((s) => s.splitViolations.length),
    "avg uncovered %": +((100 * sum((s) => s.uncovered)) / scores.length).toFixed(1),
    errors: scores.filter((s) => s.error).length,
    "avg input tok": Math.round(sum((s) => s.usage.input) / scores.length),
    "avg output tok": Math.round(sum((s) => s.usage.output) / scores.length),
  }
}

describe.skipIf(!API_KEY)(`chunk prompt eval (${MODEL})`, () => {
  it("old vs new Spanish prompt", { timeout: 600_000 }, async () => {
    const results: Record<string, CaseScore[]> = {}
    for (const [name, build] of Object.entries(PROMPTS)) results[name] = await runPrompt(build)

    console.table(Object.entries(results).map(([name, s]) => summarize(name, s)))
    for (const [name, scores] of Object.entries(results)) {
      scores.forEach((s, i) => {
        const problems = [
          ...s.missedGroups.map((g) => `missed "${g}"`),
          ...s.splitViolations.map((v) => `over-grouped "${v}"`),
          ...(s.error ? [`error: ${s.error}`] : []),
        ]
        if (problems.length) console.log(`[${name}] #${i + 1} ${GOLD[i]!.text}\n    ${problems.join("; ")}`)
      })
    }

    const outPath = process.env.EVAL_OUT || join(tmpdir(), `chunk-prompt-eval-${MODEL}.json`)
    writeFileSync(
      outPath,
      JSON.stringify(
        GOLD.map((g, i) => ({ text: g.text, ...Object.fromEntries(Object.entries(results).map(([n, s]) => [n, s[i]])) })),
        null,
        2,
      ),
    )
    console.log(`Full outputs (meanings/notes side by side): ${outPath}`)
  })
})
