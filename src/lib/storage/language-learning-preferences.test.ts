import { describe, expect, it } from "vitest"
import {
  browserNativeLanguage,
  defaultLanguageLearningPreferences,
} from "./language-learning-preferences"

describe("browserNativeLanguage", () => {
  it("reads the first supported language from the browser list", () => {
    expect(browserNativeLanguage(["es-VE", "en-US"])).toBe("spanish")
    expect(browserNativeLanguage(["fr-CA"])).toBe("french")
    expect(browserNativeLanguage(["de-DE", "en-GB"])).toBe("english")
  })

  it("falls back to English for unsupported or missing languages", () => {
    expect(browserNativeLanguage(["de-DE"])).toBe("english")
    expect(browserNativeLanguage([])).toBe("english")
  })
})

describe("defaultLanguageLearningPreferences", () => {
  it("starts a Spanish- or French-language browser on English, explained in their language", () => {
    expect(defaultLanguageLearningPreferences(["es-VE"])).toEqual({ learning: "english", native: "spanish" })
    expect(defaultLanguageLearningPreferences(["fr-FR"])).toEqual({ learning: "english", native: "french" })
  })

  it("keeps the existing Spanish default for everyone else", () => {
    expect(defaultLanguageLearningPreferences(["en-US"])).toEqual({ learning: "spanish", native: "english" })
  })
})
