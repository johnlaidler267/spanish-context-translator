/**
 * Proves the EPUB upload front door actually reaches the existing translate/read
 * pipeline: build a tiny valid EPUB in-memory, upload it through the real "Upload
 * EPUB" control on the Library page, and confirm the reading view renders the
 * (mocked) translated content -- not just that parsing succeeded in isolation.
 * Distinct from library-smoke.spec.ts's own upload test, which only asserts the
 * new book's title appears back in the on-screen list (proving upload -> parse ->
 * save -> list-refresh) -- this instead proves the save is immediately followed
 * into the translate call and the reading view (library/index.tsx's
 * handleFileSelected calls onStartReading right after a successful save).
 *
 * Uses the tests/e2e-mocks harness (see its README) rather than a real Supabase
 * project or Groq key. The unit coverage for the parser itself lives in
 * src/lib/epub/parse-epub.test.ts; this is the one browser-level check.
 */

import JSZip from "jszip"
import { test, expect } from "../e2e-mocks/fixtures"

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

const CONTENT_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Cuento de Prueba</dc:title>
  </metadata>
  <manifest>
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chap1"/>
  </spine>
</package>`

const CHAPTER1_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
<p>Había una vez un zorro que vivía feliz en el bosque.</p>
</body>
</html>`

async function buildSampleEpub(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", CONTAINER_XML)
  zip.file("OEBPS/content.opf", CONTENT_OPF)
  zip.file("OEBPS/chapter1.xhtml", CHAPTER1_XHTML)
  return zip.generateAsync({ type: "nodebuffer" })
}

// `user_epubs` isn't part of the fixture's automatic default mock set (unlike discover_items /
// user_subscriptions) -- without this, the save has nothing to talk to. Two things this row
// has to satisfy:
//  1. handleFileSelected's save (`.insert(...).select("id").single()`) -- the mock always
//     replies with this whole array regardless of method/body, and `.single()` (unlike
//     `.maybeSingle()`) doesn't unwrap a 1-element array, so the saved book ends up with
//     `id: undefined`. Harmless here: the card handleFileSelected renders is built from the
//     upload's own parsed fields, not from this response.
//  2. handleLibraryStartReading's immediate re-fetch-by-id (`getUserEpubText`, which does use
//     `.maybeSingle()` and so *does* unwrap this array) -- it needs a real `body_text` back, or
//     the app treats the book as missing and shows a "Couldn't load this book" error instead of
//     ever reaching translate. The mock replies with this same row regardless of the `id`/
//     `user_id` filters in the request, so its own id doesn't need to match `undefined`.
test.use({
  mockOptions: {
    restTables: {
      user_epubs: [
        {
          id: "mock-epub-1",
          title: "Cuento de Prueba",
          file_name: "cuento-de-prueba.epub",
          char_count: 54,
          body_text: "Había una vez un zorro que vivía feliz en el bosque.",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
    },
  },
})

test("uploading an EPUB flows through translate into the reading view", async ({ page }) => {
  const epubBuffer = await buildSampleEpub()

  // The "Upload EPUB" control lives on the Library page, not the landing page. Feed the file
  // straight to the (visually hidden, but real) <input type="file"> rather than clicking the
  // "Upload EPUB" button and waiting for a native filechooser -- same approach library-smoke.spec.ts
  // uses for its own upload test, and more reliable than a real OS file-picker round trip.
  await page.goto("/library")

  await page.locator('input[type="file"]').setInputFiles({
    name: "cuento-de-prueba.epub",
    mimeType: "application/epub+zip",
    buffer: epubBuffer,
  })

  // The reading view renders the mocked groq-chat response's chunk text ("Hola"/"mundo" --
  // see DEFAULT_GROQ_CHAT_CONTENT in tests/e2e-mocks/supabase-mock.ts), which only appears
  // once the parsed EPUB text has actually gone through handleTextSubmit's translate call.
  await expect(page.getByText("Hola").first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("mundo").first()).toBeVisible()
})
