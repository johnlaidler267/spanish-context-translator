import { describe, expect, it } from "vitest"
import { pickAuthors } from "@/lib/source-authors"

describe("pickAuthors", () => {
  it("maps only the wanted titles, preferring the earlier source", () => {
    const library = [
      { title: "Maniac", author: "Benjamín Labatut" },
      { title: "Other book", author: "Someone" },
    ]
    const discover = [
      { title: "Maniac", author: "Wrong Author" },
      { title: "La tormenta", author: " El País " },
    ]
    expect(
      pickAuthors(["Maniac", "La tormenta", "Pasted text"], library, discover),
    ).toEqual(
      new Map([
        ["Maniac", "Benjamín Labatut"],
        ["La tormenta", "El País"],
      ]),
    )
  })

  it("skips rows without an author", () => {
    expect(
      pickAuthors(
        ["Maniac"],
        [{ title: "Maniac", author: null }],
        [{ title: "Maniac", author: "" }],
      ),
    ).toEqual(new Map())
  })
})
