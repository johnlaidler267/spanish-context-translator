// @vitest-environment jsdom
//
// parse-epub.ts uses the browser's native DOMParser, so this file alone opts into a
// jsdom test environment (the rest of the suite runs under plain node -- see
// vite.config.js `test.environment` -- which is faster and sufficient everywhere else).

import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { parseEpub, EpubParseError, truncateForPreview } from "@/lib/epub/parse-epub"

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

function buildOpf(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chap1"/>
    <itemref idref="chap2"/>
  </spine>
</package>`
}

function chapterXhtml(paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter</title></head>
<body>${body}</body>
</html>`
}

async function buildMinimalEpub(opts: {
  title?: string
  chapter1?: string[]
  chapter2?: string[]
} = {}): Promise<Blob> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", CONTAINER_XML)
  zip.file("OEBPS/content.opf", buildOpf(opts.title ?? "Mi Libro de Prueba"))
  zip.file(
    "OEBPS/chapter1.xhtml",
    chapterXhtml(opts.chapter1 ?? ["Había una vez un zorro.", "El zorro corría por el bosque."]),
  )
  zip.file(
    "OEBPS/chapter2.xhtml",
    chapterXhtml(opts.chapter2 ?? ["Capítulo dos.", "El final de la historia."]),
  )
  return zip.generateAsync({ type: "blob" })
}

describe("parseEpub", () => {
  it("extracts plain text from every chapter, in spine order, with the title", async () => {
    const epub = await buildMinimalEpub()
    const { text, title } = await parseEpub(epub)

    expect(title).toBe("Mi Libro de Prueba")
    expect(text).toBe(
      [
        "Había una vez un zorro.",
        "",
        "El zorro corría por el bosque.",
        "",
        "Capítulo dos.",
        "",
        "El final de la historia.",
      ].join("\n"),
    )
    // Spine order: chapter 1's content must precede chapter 2's.
    expect(text.indexOf("zorro")).toBeLessThan(text.indexOf("Capítulo dos"))
  })

  it("rejects a file that isn't a zip at all", async () => {
    const notAZip = new Blob(["this is just plain text, not a zip"], { type: "text/plain" })
    await expect(parseEpub(notAZip)).rejects.toBeInstanceOf(EpubParseError)
  })

  it("rejects a zip missing META-INF/container.xml", async () => {
    const zip = new JSZip()
    zip.file("hello.txt", "not an epub")
    const blob = await zip.generateAsync({ type: "blob" })
    await expect(parseEpub(blob)).rejects.toBeInstanceOf(EpubParseError)
  })

  it("rejects an epub whose chapters have no extractable text", async () => {
    const zip = new JSZip()
    zip.file("META-INF/container.xml", CONTAINER_XML)
    zip.file("OEBPS/content.opf", buildOpf("Vacío"))
    zip.file("OEBPS/chapter1.xhtml", chapterXhtml([]))
    zip.file("OEBPS/chapter2.xhtml", chapterXhtml([]))
    const blob = await zip.generateAsync({ type: "blob" })
    await expect(parseEpub(blob)).rejects.toBeInstanceOf(EpubParseError)
  })
})

describe("truncateForPreview", () => {
  it("returns the text unchanged when already within the limit", () => {
    expect(truncateForPreview("Hola mundo.", 600)).toBe("Hola mundo.")
  })

  it("cuts at the nearest sentence boundary within the limit", () => {
    const text = "Uno dos tres. Cuatro cinco seis siete ocho nueve diez once doce trece."
    const out = truncateForPreview(text, 20)
    expect(out).toBe("Uno dos tres.")
    expect(out.length).toBeLessThanOrEqual(20)
  })

  it("falls back to a word boundary when no sentence end is close enough", () => {
    const text = "palabrauno palabradoz palabratres palabracuatro palabracinco"
    const out = truncateForPreview(text, 30)
    expect(text.startsWith(out)).toBe(true)
    expect(out.endsWith(" ")).toBe(false)
    expect(out.length).toBeLessThanOrEqual(30)
  })

  it("hard-cuts when no boundary falls within the acceptable range", () => {
    const text = "supercalifragilisticexpialidocious"
    const out = truncateForPreview(text, 10)
    expect(out).toBe("supercalif")
  })
})
