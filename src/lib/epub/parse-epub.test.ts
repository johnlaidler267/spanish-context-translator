// @vitest-environment jsdom
//
// parse-epub.ts uses the browser's native DOMParser, so this file alone opts into a
// jsdom test environment (the rest of the suite runs under plain node -- see
// vite.config.js `test.environment` -- which is faster and sufficient everywhere else).

import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import {
  parseEpub,
  EpubParseError,
  truncateForPreview,
  detectStoryStartIndex,
  MAX_COVER_SOURCE_BYTES,
  MAX_DESCRIPTION_CHARS,
} from "@/lib/epub/parse-epub"

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

  it("returns null description when the OPF has no dc:description", async () => {
    const epub = await buildMinimalEpub()
    const { description } = await parseEpub(epub)
    expect(description).toBeNull()
  })

  it("extracts the description from dc:description", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `<dc:description>Una historia de amor y guerra en Macondo.</dc:description>`,
    })
    const { description } = await parseEpub(epub)
    expect(description).toBe("Una historia de amor y guerra en Macondo.")
  })

  it("strips entity-encoded HTML tags out of the description", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `<dc:description>&lt;div&gt;&lt;p&gt;Una novela sobre los límites del pensamiento.&lt;/p&gt;&lt;p&gt;Un tríptico inquietante.&lt;/p&gt;&lt;/div&gt;</dc:description>`,
    })
    const { description } = await parseEpub(epub)
    expect(description).not.toBeNull()
    expect(description).not.toMatch(/[<>]/)
    expect(description).toBe(
      "Una novela sobre los límites del pensamiento.\n\nUn tríptico inquietante.",
    )
  })

  it("decodes HTML entities in the description without leaving raw markup", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `<dc:description>&lt;b&gt;Ciencia&lt;/b&gt; &amp;amp; ficción, con &lt;br/&gt;saltos de línea.</dc:description>`,
    })
    const { description } = await parseEpub(epub)
    expect(description).toBe("Ciencia & ficción, con\nsaltos de línea.")
  })

  it("leaves a plain-text description with no markup unchanged", async () => {
    const epub = await buildMinimalEpub({
      metadataExtra: `<dc:description>Una historia sencilla, sin etiquetas.</dc:description>`,
    })
    const { description } = await parseEpub(epub)
    expect(description).toBe("Una historia sencilla, sin etiquetas.")
  })

  it("truncates an overlong description to MAX_DESCRIPTION_CHARS", async () => {
    const longDescription = "Una palabra larga. ".repeat(300) // well over MAX_DESCRIPTION_CHARS
    const epub = await buildMinimalEpub({
      metadataExtra: `<dc:description>${longDescription}</dc:description>`,
    })
    const { description } = await parseEpub(epub)
    expect(description).not.toBeNull()
    expect(description!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS)
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

// A paragraph of ~130 words -- comfortably over FRONT_MATTER_MAX_WORDS (120), so a chapter
// built from it reads as "real content" to the heuristic regardless of its filename.
const LONG_CHAPTER_PARAGRAPH = Array(130).fill("palabra").join(" ")

function opfWithChapters(chapters: { id: string; path: string }[], guideHref?: string): string {
  const manifest = chapters
    .map((c) => `<item id="${c.id}" href="${c.path}" media-type="application/xhtml+xml"/>`)
    .join("\n    ")
  const spine = chapters.map((c) => `<itemref idref="${c.id}"/>`).join("\n    ")
  const guide = guideHref ? `<guide><reference type="text" href="${guideHref}"/></guide>` : ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Libro con Preámbulo</dc:title>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
  ${guide}
</package>`
}

async function buildEpubWithChapters(opts: {
  chapters: { id: string; path: string; paragraphs: string[] }[]
  guideHref?: string
}): Promise<Blob> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", CONTAINER_XML)
  zip.file("OEBPS/content.opf", opfWithChapters(opts.chapters, opts.guideHref))
  for (const c of opts.chapters) {
    zip.file(`OEBPS/${c.path}`, chapterXhtml(c.paragraphs))
  }
  return zip.generateAsync({ type: "blob" })
}

describe("parseEpub story start detection", () => {
  it("returns storyStartOffset 0 for a normal book with no front matter", async () => {
    // A realistically-sized chapter, not buildMinimalEpub()'s toy 2-sentence fixture -- a real
    // chapter's word count is what keeps the heuristic from mistaking it for front matter.
    const epub = await buildEpubWithChapters({
      chapters: [{ id: "chap1", path: "chapter1.xhtml", paragraphs: [LONG_CHAPTER_PARAGRAPH] }],
    })
    const { storyStartOffset } = await parseEpub(epub)
    expect(storyStartOffset).toBe(0)
  })

  it("skips straight to the OPF guide's type=text reference when present", async () => {
    const epub = await buildEpubWithChapters({
      chapters: [
        { id: "cover", path: "cover.xhtml", paragraphs: ["Portada."] },
        { id: "title", path: "titlepage.xhtml", paragraphs: ["Título del libro."] },
        { id: "chap1", path: "chapter1.xhtml", paragraphs: [LONG_CHAPTER_PARAGRAPH] },
      ],
      guideHref: "chapter1.xhtml",
    })
    const { text, storyStartOffset } = await parseEpub(epub)
    expect(text.slice(storyStartOffset)).toBe(LONG_CHAPTER_PARAGRAPH)
  })

  it("falls back to the front-matter heuristic when the EPUB has no guide", async () => {
    const epub = await buildEpubWithChapters({
      chapters: [
        { id: "title", path: "titlepage.xhtml", paragraphs: ["Mi Novela"] },
        { id: "copyright", path: "copyright.xhtml", paragraphs: ["Todos los derechos reservados."] },
        { id: "chap1", path: "chapter1.xhtml", paragraphs: [LONG_CHAPTER_PARAGRAPH] },
      ],
    })
    const { text, storyStartOffset } = await parseEpub(epub)
    expect(text.slice(storyStartOffset)).toBe(LONG_CHAPTER_PARAGRAPH)
  })

  it("never skips a book's only chapter, however short", async () => {
    const epub = await buildEpubWithChapters({
      chapters: [{ id: "chap1", path: "chapter1.xhtml", paragraphs: ["Corto."] }],
    })
    const { text, storyStartOffset } = await parseEpub(epub)
    expect(storyStartOffset).toBe(0)
    expect(text).toBe("Corto.")
  })
})

describe("detectStoryStartIndex", () => {
  const real = { path: "chapter1.xhtml", text: LONG_CHAPTER_PARAGRAPH }

  it("returns 0 when the first entry already looks like real content", () => {
    expect(detectStoryStartIndex([real, real], null)).toBe(0)
  })

  it("skips entries that look like front matter by filename, stopping at real content", () => {
    const titlePage = { path: "titlepage.xhtml", text: "Mi Novela" }
    const copyright = { path: "copyright.xhtml", text: "Todos los derechos reservados." }
    expect(detectStoryStartIndex([titlePage, copyright, real], null)).toBe(2)
  })

  it("skips a short entry even with an unremarkable filename", () => {
    const shortIntro = { path: "section1.xhtml", text: "Uno." }
    expect(detectStoryStartIndex([shortIntro, real], null)).toBe(1)
  })

  it("never skips the last entry, even if it also looks like front matter", () => {
    const titlePage = { path: "titlepage.xhtml", text: "Mi Novela" }
    expect(detectStoryStartIndex([titlePage], null)).toBe(0)
  })

  it("caps how many entries the heuristic can skip", () => {
    // 10 short "looks like front matter" entries followed by real content -- MAX_HEURISTIC_SKIP_
    // ENTRIES (8) and MAX_HEURISTIC_SKIP_FRACTION (0.25 of 11 ≈ 2) both cap this well short of 10.
    const shortEntries = Array.from({ length: 10 }, (_, i) => ({
      path: `section${i}.xhtml`,
      text: "Uno.",
    }))
    expect(detectStoryStartIndex([...shortEntries, real], null)).toBe(2)
  })

  it("trusts a guide reference that resolves to one of the entries", () => {
    const titlePage = { path: "titlepage.xhtml", text: "Mi Novela" }
    expect(detectStoryStartIndex([titlePage, real], "chapter1.xhtml")).toBe(1)
  })

  it("falls back to the heuristic when the guide reference doesn't match any entry", () => {
    const titlePage = { path: "titlepage.xhtml", text: "Mi Novela" }
    expect(detectStoryStartIndex([titlePage, real], "missing.xhtml")).toBe(1)
  })

  it("bounds a guide reference pointing past the middle of the book", () => {
    // Guide (mistakenly, or corruptly) points at the very last of 10 entries -- trusting it
    // outright would skip 90% of the book, so it's clamped to the first-half sanity bound.
    const entries = Array.from({ length: 10 }, (_, i) => ({
      path: `section${i}.xhtml`,
      text: LONG_CHAPTER_PARAGRAPH,
    }))
    expect(detectStoryStartIndex(entries, "section9.xhtml")).toBe(5)
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
