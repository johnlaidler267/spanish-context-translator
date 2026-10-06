import { describe, expect, it, vi, beforeEach } from "vitest"

const fetchChatCompletion = vi.fn()
vi.mock("@/lib/translate/chat-completion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translate/chat-completion")>()),
  fetchChatCompletion: (body: unknown) => fetchChatCompletion(body),
}))

const { chunkReplyToItems, splitNearMiddle, translatePageText } = await import("@/lib/translate/translate-page")
const { ChunkingCutOffError, UntranslatedStretchError } = await import("@/lib/translate/chunk-reconcile")

// The first page of "El tiempo entre costuras" -- Gemini answered it with one row for the hinted
// "sin embargo", and the reconciled result (the whole paragraph as plain text, no hover meanings)
// was accepted and stored in the shared translation cache.
const PAGE =
  "Una máquina de escribir reventó mi destino. Fue una Hispano—Olivetti y de ella me separó durante semanas el cristal de un escaparate. Visto desde hoy, desde el parapeto de los años transcurridos, cuesta creer que un simple objeto mecánico pudiera tener el potencial suficiente como para quebrar el rumbo de una vida y dinamitar en cuatro días todos los planes trazados para sostenerla. Así fue, sin embargo, y nada pude hacer para impedirlo."
const HINT_ONLY_REPLY = JSON.stringify([{ c: "sin embargo", m: "however", l: "without embargo" }])
const FULL_REPLY = JSON.stringify(
  PAGE.replace(/[.,]/g, "")
    .split(/\s+/)
    .map((w) => ({ c: w, m: `en:${w}` })),
)

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }),
    { status: 200 },
  )
}

const userPrompt = (call: number) =>
  (fetchChatCompletion.mock.calls[call]![0] as { messages: { content: string }[] }).messages[1]!.content

describe("translatePageText coverage", () => {
  beforeEach(() => {
    fetchChatCompletion.mockReset()
  })

  it("rejects a reply that leaves most of the page untranslated", () => {
    expect(() => chunkReplyToItems(HINT_ONLY_REPLY, PAGE)).toThrow(UntranslatedStretchError)
  })

  it("accepts a reply that covers the page", () => {
    const items = chunkReplyToItems(FULL_REPLY, PAGE)
    expect(items.filter((i) => i.type === "chunk").length).toBeGreaterThan(60)
  })

  it("retries once without the substring hints when the first reply skips the page", async () => {
    fetchChatCompletion
      .mockResolvedValueOnce(chatResponse(HINT_ONLY_REPLY))
      .mockResolvedValueOnce(chatResponse(FULL_REPLY))
    const items = await translatePageText(PAGE)
    expect(items.filter((i) => i.type === "chunk").length).toBeGreaterThan(60)
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2)
    expect(userPrompt(0)).toContain('["sin embargo"]')
    expect(userPrompt(1)).not.toContain("sin embargo\"]")
    expect(userPrompt(1)).toContain(`TEXT:\n${PAGE}`)
  })

  it("fails (so nothing is cached) when the retry also skips the page", async () => {
    fetchChatCompletion.mockImplementation(async () => chatResponse(HINT_ONLY_REPLY))
    await expect(translatePageText(PAGE)).rejects.toThrow(UntranslatedStretchError)
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2)
  })
})

/** One row per word of `text` (punctuation left out, as the model does). */
const rowsFor = (text: string) =>
  text
    .replace(/[.,—]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ c: w, m: `en:${w}` }))

const textOf = (body: unknown) =>
  ((body as { messages: { content: string }[] }).messages[1]!.content.split("TEXT:\n")[1] ?? "")

describe("translatePageText cut-off replies", () => {
  beforeEach(() => {
    fetchChatCompletion.mockReset()
  })

  const SECOND_PARAGRAPH =
    "No eran en realidad grandes proyectos los que yo atesoraba por entonces. Se trataba tan sólo de aspiraciones cercanas, casi domésticas, coherentes con las coordenadas del sitio y el tiempo que me había tocado vivir."
  const LONG_PAGE = `${PAGE}\n\n${SECOND_PARAGRAPH}`

  it("translates a page in two halves when the reply stops partway through", async () => {
    // Whole page: the reply covers only the first paragraph, as a reply cut off at the output
    // limit does. Each half on its own: covered in full.
    fetchChatCompletion.mockImplementation(async (body: unknown) => {
      const text = textOf(body)
      return chatResponse(JSON.stringify(rowsFor(text === LONG_PAGE ? PAGE : text)))
    })
    const items = await translatePageText(LONG_PAGE)
    expect(fetchChatCompletion).toHaveBeenCalledTimes(3)
    const joined = items.map((i) => (i.type === "chunk" ? i.chunk : i.type === "text" ? i.text : "")).join("")
    expect(joined.replace(/\s+/g, " ")).toBe(LONG_PAGE.replace(/\s+/g, " "))
    const plain = items.filter((i) => i.type === "text" && /\p{L}/u.test(i.text))
    expect(plain).toEqual([])
  })

  it("also splits when the proxy reports the output limit", async () => {
    fetchChatCompletion.mockImplementation(async (body: unknown) => {
      const text = textOf(body)
      if (text === LONG_PAGE) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "[" }, finish_reason: "length" }] }),
          { status: 200 },
        )
      }
      return chatResponse(JSON.stringify(rowsFor(text)))
    })
    const items = await translatePageText(LONG_PAGE)
    const joined = items.map((i) => (i.type === "chunk" ? i.chunk : i.type === "text" ? i.text : "")).join("")
    expect(joined).toBe(LONG_PAGE)
    expect(fetchChatCompletion).toHaveBeenCalledTimes(3)
  })

  it("gives up with a plain message once the pieces are as small as it will go", async () => {
    fetchChatCompletion.mockImplementation(async () => chatResponse(JSON.stringify([{ c: "Una", m: "A" }])))
    await expect(translatePageText(LONG_PAGE)).rejects.toThrow(ChunkingCutOffError)
  })

  it("splits at the sentence break nearest the middle, keeping the gap", () => {
    const [a, gap, b] = splitNearMiddle("Uno dos tres. Cuatro cinco seis. Siete ocho nueve.")!
    expect([a, gap, b]).toEqual(["Uno dos tres. Cuatro cinco seis.", " ", "Siete ocho nueve."])
    expect(splitNearMiddle("hola")).toBeNull()
  })
})
