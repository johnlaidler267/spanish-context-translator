/**
 * Proves the EPUB upload front door actually reaches the existing translate/read
 * pipeline: build a tiny valid EPUB in-memory, upload it through the real "Upload
 * EPUB" control on the landing page, and confirm the reading view renders the
 * (mocked) translated content -- not just that parsing succeeded in isolation.
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

test("uploading an EPUB flows through translate into the reading view", async ({ page }) => {
  const epubBuffer = await buildSampleEpub()

  await page.goto("/")

  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload EPUB" }).click(),
  ])
  await fileChooser.setFiles({
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
