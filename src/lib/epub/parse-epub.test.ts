// @vitest-environment jsdom
//
// parse-epub.ts uses the browser's native DOMParser, so this file alone opts into a
// jsdom test environment (the rest of the suite runs under plain node -- see
// vite.config.js `test.environment` -- which is faster and sufficient everywhere else).

import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { parseEpub, EpubParseError, truncateForPreview, MAX_COVER_SOURCE_BYTES } from "@/lib/epub/parse-epub"

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

function buildOpf(title: string, metadataExtra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${title}</dc:title>
    <dc:language>es</dc:language>
    ${metadataExtra}
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
  metadataExtra?: string
  chapter1?: string[]
  chapter2?: string[]
} = {}): Promise<Blob> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", CONTAINER_XML)
  zip.file("OEBPS/content.opf", buildOpf(opts.title ?? "Mi Libro de Prueba", opts.metadataExtra ?? ""))
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

  it("returns null author when the OPF has no dc:creator", async () => {
    const epub = await buildMinimalEpub()
    const { author } = await parseEpub(epub)
    expect(author).toBeNull()
  })

  it("extracts the author from a single dc:creator", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `<dc:creator>Gabriel García Márquez</dc:creator>`,
    })
    const { author } = await parseEpub(epub)
    expect(author).toBe("Gabriel García Márquez")
  })

  it("prefers the dc:creator marked opf:role=aut over an illustrator/translator", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `
        <dc:creator opf:role="ill">Some Illustrator</dc:creator>
        <dc:creator opf:role="aut">Isabel Allende</dc:creator>
        <dc:creator opf:role="trl">Some Translator</dc:creator>
      `,
    })
    const { author } = await parseEpub(epub)
    expect(author).toBe("Isabel Allende")
  })

  it("falls back to the first dc:creator when none is marked opf:role=aut", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `
        <dc:creator>Julio Cortázar</dc:creator>
        <dc:creator opf:role="ill">Some Illustrator</dc:creator>
      `,
    })
    const { author } = await parseEpub(epub)
    expect(author).toBe("Julio Cortázar")
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

// A real (tiny, 1x1 transparent) PNG -- needs to be actual valid image bytes so this exercises
// the same base64-encoding path a real cover would, not just an arbitrary byte string.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

function opfWithCover(coverMarkup: {
  metadataExtra?: string
  manifestExtra?: string
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Libro con Portada</dc:title>
    ${coverMarkup.metadataExtra ?? ""}
  </metadata>
  <manifest>
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    ${coverMarkup.manifestExtra ?? ""}
  </manifest>
  <spine>
    <itemref idref="chap1"/>
  </spine>
</package>`
}

async function buildEpubWithCover(opts: {
  metadataExtra?: string
  manifestExtra?: string
  coverPath?: string
  coverBase64?: string
}): Promise<Blob> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", CONTAINER_XML)
  zip.file("OEBPS/content.opf", opfWithCover(opts))
  zip.file("OEBPS/chapter1.xhtml", chapterXhtml(["Texto de prueba."]))
  if (opts.coverPath) {
    zip.file(opts.coverPath, opts.coverBase64 ?? TINY_PNG_BASE64, { base64: true })
  }
  return zip.generateAsync({ type: "blob" })
}

describe("parseEpub cover extraction", () => {
  it("extracts the cover from an EPUB3 manifest item marked properties=cover-image", async () => {
    const epub = await buildEpubWithCover({
      manifestExtra: `<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>`,
      coverPath: "OEBPS/cover.png",
    })
    const { coverImage } = await parseEpub(epub)
    expect(coverImage).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`)
  })

  it("extracts the cover via an EPUB2 <meta name=cover> pointing at a manifest id", async () => {
    const epub = await buildEpubWithCover({
      metadataExtra: `<meta name="cover" content="my-cover-id"/>`,
      manifestExtra: `<item id="my-cover-id" href="images/front.jpg" media-type="image/jpeg"/>`,
      coverPath: "OEBPS/images/front.jpg",
    })
    const { coverImage } = await parseEpub(epub)
    expect(coverImage).toBe(`data:image/jpeg;base64,${TINY_PNG_BASE64}`)
  })

  it("falls back to a manifest item conventionally named for the cover", async () => {
    const epub = await buildEpubWithCover({
      manifestExtra: `<item id="cover" href="cover.jpg" media-type="image/jpeg"/>`,
      coverPath: "OEBPS/cover.jpg",
    })
    const { coverImage } = await parseEpub(epub)
    expect(coverImage).toBe(`data:image/jpeg;base64,${TINY_PNG_BASE64}`)
  })

  it("returns null (not an error) for an EPUB with no cover", async () => {
    const epub = await buildEpubWithCover({})
    const { coverImage, text } = await parseEpub(epub)
    expect(coverImage).toBeNull()
    expect(text).toBe("Texto de prueba.")
  })

  it("skips a cover over the size cap rather than storing it", async () => {
    // JSZip's `{ base64: true }` file() option decodes this back to raw bytes for us -- doesn't
    // matter that it isn't a real PNG, since the size cap check happens before any image
    // decoding.
    const oversizedBytes = new Uint8Array(MAX_COVER_SOURCE_BYTES + 1).fill(1)
    let binary = ""
    for (const byte of oversizedBytes) binary += String.fromCharCode(byte)
    const epub = await buildEpubWithCover({
      manifestExtra: `<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>`,
      coverPath: "OEBPS/cover.png",
      coverBase64: btoa(binary),
    })
    const { coverImage } = await parseEpub(epub)
    expect(coverImage).toBeNull()
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
