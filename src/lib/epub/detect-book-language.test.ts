import { describe, it, expect } from "vitest"
import {
  detectBookLanguage,
  detectTextLanguage,
  learningLanguageFromTag,
} from "@/lib/epub/detect-book-language"

const SPANISH =
  "Cuando llegó a la casa, el perro estaba dormido en el jardín. Los niños jugaban con una pelota " +
  "por la calle, pero su madre los llamó para comer. Había muy poca comida, y ella estaba cansada " +
  "porque el día fue largo. Yo creo que es mejor así, dijo él, como siempre. "
const FRENCH =
  "Quand il est arrivé à la maison, le chien dormait dans le jardin. Les enfants jouaient avec une " +
  "balle sur la route, mais leur mère les a appelés pour manger. Elle était très fatiguée, et nous " +
  "ne savions pas pourquoi. Je pense que ce soir vous pouvez venir au marché avec des amis. "
const ENGLISH =
  "When he got to the house, the dog was asleep in the garden. The children were playing with a " +
  "ball in the street, but their mother called them in for dinner. She had not slept, and it was " +
  "late. You would think that they knew better, but this is how his family is. "

describe("detectTextLanguage", () => {
  it("recognizes Spanish, French and English prose", () => {
    expect(detectTextLanguage(SPANISH.repeat(3))).toBe("spanish")
    expect(detectTextLanguage(FRENCH.repeat(3))).toBe("french")
    expect(detectTextLanguage(ENGLISH.repeat(3))).toBe("english")
  })

  it("won't guess from too little text", () => {
    expect(detectTextLanguage("Hola, el mundo.")).toBeNull()
  })

  it("won't guess on an evenly mixed text", () => {
    expect(detectTextLanguage((SPANISH + FRENCH + ENGLISH).repeat(3))).toBeNull()
  })
})

describe("learningLanguageFromTag", () => {
  it("maps common EPUB language tags", () => {
    expect(learningLanguageFromTag("es-MX")).toBe("spanish")
    expect(learningLanguageFromTag("fre")).toBe("french")
    expect(learningLanguageFromTag("en_US")).toBe("english")
    expect(learningLanguageFromTag("de")).toBeNull()
    expect(learningLanguageFromTag(null)).toBeNull()
  })
})

describe("detectBookLanguage", () => {
  it("trusts the text over metadata that says otherwise", () => {
    expect(detectBookLanguage({ text: SPANISH.repeat(3), languageTag: "en" }, "french")).toBe("spanish")
  })

  it("falls back to the metadata, then the language being learned", () => {
    expect(detectBookLanguage({ text: "Hola.", languageTag: "es" }, "french")).toBe("spanish")
    expect(detectBookLanguage({ text: "Hola.", languageTag: null }, "french")).toBe("french")
  })
})
