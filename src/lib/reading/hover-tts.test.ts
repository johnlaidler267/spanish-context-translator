import { afterEach, describe, expect, it, vi } from "vitest"
import { pickVoiceForLanguage, speakHoverChunk } from "./hover-tts"

const voice = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice

const VOICES = [voice("en-US"), voice("es-MX"), voice("es-ES"), voice("fr_FR"), voice("fr-CA")]

describe("pickVoiceForLanguage", () => {
  it("picks a voice matching the learning language", () => {
    expect(pickVoiceForLanguage(VOICES, "spanish")?.lang).toBe("es-MX")
    expect(pickVoiceForLanguage(VOICES, "french")?.lang).toBe("fr_FR")
    expect(pickVoiceForLanguage(VOICES, "english")?.lang).toBe("en-US")
  })

  it("never falls back to another language's voice", () => {
    expect(pickVoiceForLanguage([voice("es-MX")], "french")).toBeUndefined()
  })
})

describe("speakHoverChunk", () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubSpeech(voices: SpeechSynthesisVoice[], learning: string) {
    const spoken: { text: string; lang: string; voice?: SpeechSynthesisVoice }[] = []
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ learning, native: "english" }),
    })
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      lang = ""
      voice?: SpeechSynthesisVoice
      rate = 1
      pitch = 1
      constructor(public text: string) {}
    })
    vi.stubGlobal("window", {
      speechSynthesis: {
        getVoices: () => voices,
        addEventListener: () => {},
        cancel: () => {},
        speak: (u: { text: string; lang: string; voice?: SpeechSynthesisVoice }) => spoken.push(u),
      },
    })
    return spoken
  }

  it("speaks French chunks with a French voice when learning French", () => {
    const spoken = stubSpeech(VOICES, "french")
    speakHoverChunk("Il était une fois")
    expect(spoken[0]?.lang).toBe("fr_FR")
  })

  it("falls back to a French lang tag, not Spanish, when no French voice is installed", () => {
    const spoken = stubSpeech([voice("es-MX")], "french")
    speakHoverChunk("Y voilà")
    expect(spoken[0]).toMatchObject({ lang: "fr-FR", text: "Y voilà" })
  })
})
