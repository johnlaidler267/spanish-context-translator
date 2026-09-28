import { afterEach, describe, expect, it, vi } from "vitest"

const edge = vi.hoisted(() => ({ transcribeAudioViaEdge: vi.fn(async () => "ok") }))
vi.mock("@/lib/groq-edge", () => edge)

import { transcribeAudioWithGroq } from "./transcription"

describe("transcribeAudioWithGroq", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    edge.transcribeAudioViaEdge.mockClear()
  })

  function stubLearning(learning: string) {
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ learning, native: "english" }),
    })
  }

  it.each([
    ["spanish", "es"],
    ["french", "fr"],
    ["english", "en"],
  ])("transcribes a %s learner's speech as %s", async (learning, code) => {
    stubLearning(learning)
    await transcribeAudioWithGroq(new Blob(["x"]), "a.webm")
    expect(edge.transcribeAudioViaEdge).toHaveBeenCalledWith(expect.any(Blob), "a.webm", code)
  })
})
