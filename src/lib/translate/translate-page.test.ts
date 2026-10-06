import { describe, expect, it, vi, beforeEach } from "vitest"

const fetchChatCompletion = vi.fn()
vi.mock("@/lib/translate/chat-completion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translate/chat-completion")>()),
  fetchChatCompletion: (body: unknown) => fetchChatCompletion(body),
}))

const { chunkReplyToItems, translatePageText } = await import("@/lib/translate/translate-page")
const { UntranslatedStretchError } = await import("@/lib/translate/chunk-reconcile")

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
  beforeEach(() => fetchChatCompletion.mockReset())

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
