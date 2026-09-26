import { describe, expect, it } from "vitest"
import { canShowDropCap } from "./drop-cap"

describe("canShowDropCap", () => {
  it("allows a letter, optionally after opening punctuation", () => {
    expect(canShowDropCap("Es una tarde calurosa")).toBe(true)
    expect(canShowDropCap("¿Quiénes se ofrecen?")).toBe(true)
    expect(canShowDropCap("«Hola», dijo")).toBe(true)
  })

  it("skips a paragraph that opens with a dialogue dash or non-letter", () => {
    expect(canShowDropCap("—¿Quiénes se ofrecen de voluntarios?—dice")).toBe(false)
    expect(canShowDropCap("– Hola")).toBe(false)
    expect(canShowDropCap("1985 fue un año")).toBe(false)
    expect(canShowDropCap("")).toBe(false)
  })
})
