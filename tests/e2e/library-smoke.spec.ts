/**
 * Smoke test for the personal EPUB library (src/pages/library) -- the one flow that
 * genuinely needs a real browser: a file upload landing in the on-screen list, and a
 * saved book's progress badge driving a click back into the reading pipeline. The
 * underlying DB-adjacent logic (save/list/delete against `user_epubs`) has its own
 * plain Vitest coverage in src/lib/storage/epub-library.test.ts -- this only proves
 * the page actually wires that logic up to something a person can see and click.
 */

import JSZip from "jszip"
// Plain @playwright/test, not the auto-applying fixtures wrapper: every test here needs its
// own `user_epubs` (and sometimes `reading_progress`) rows, so each calls `setupMocks` itself
// with exactly what it needs instead of layering custom options on top of an auto-applied
// default (see tests/e2e-mocks/README.md's "signed-out / guest experience" example for the
// same pattern).
import { test, expect } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

function buildOpf(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata>
  <manifest><item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chap1"/></spine>
</package>`
}

function chapterXhtml(paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>${body}</body></html>`
}

/** A real, minimal, valid .epub as an in-memory buffer -- fed to setInputFiles below with no
 *  disk I/O needed (Playwright accepts a {name, mimeType, buffer} in place of a file path). */
async function buildMinimalEpubBuffer(title: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", CONTAINER_XML)
  zip.file("OEBPS/content.opf", buildOpf(title))
  zip.file("OEBPS/chapter1.xhtml", chapterXhtml(["Había una vez un zorro.", "El zorro corría por el bosque."]))
  return zip.generateAsync({ type: "nodebuffer" })
}

// `user_epubs` isn't part of setupMocks' automatic default set (unlike discover_items /
// user_subscriptions) -- every test here mocks it explicitly so `listUserEpubs` never falls
// through to a real (and here, nonexistent) network request.

test("uploading an EPUB saves it and shows it in the library list", async ({ page }) => {
  await setupMocks(page, { restTables: { user_epubs: [] } })
  await page.goto("/library")
  await expect(page.getByText("No books yet")).toBeVisible()

  const epubBuffer = await buildMinimalEpubBuffer("Mi Libro de Prueba")
  await page.locator('input[type="file"]').setInputFiles({
    name: "mi-libro.epub",
    mimeType: "application/epub+zip",
    buffer: epubBuffer,
  })

  // Parsed client-side from the EPUB's own <dc:title> (not from any mocked response) --
  // proves the upload → parse → save → list-update chain actually ran end to end.
  // `.first()`: the card renders the title both on its cover plate and in its body (same as
  // Discover's ContentCard/DiscoverCoverArt do for a title with no cover image).
  await expect(page.getByText("Mi Libro de Prueba").first()).toBeVisible()
})

test("shows reading progress on a saved book and resumes it on click", async ({ page }) => {
  await setupMocks(page, {
    restTables: {
      user_epubs: [
        {
          id: "mock-epub-1",
          title: "Mi Libro Guardado",
          file_name: "mi-libro-guardado.epub",
          char_count: 58,
          body_text: "Había una vez un zorro. El zorro corría por el bosque.",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      // 5th of 10 pages read -> the library card's "50% read" badge.
      reading_progress: [
        { content_id: "mock-epub-1", page_index: 4, total_pages: 10, updated_at: "2024-01-01T00:00:00.000Z" },
      ],
    },
  })

  await page.goto("/library")
  await expect(page.getByText("Mi Libro Guardado").first()).toBeVisible()
  await expect(page.getByText("50% read")).toBeVisible()

  await page.getByText("Mi Libro Guardado").first().click()

  // Clicking hands the saved body_text to the same translate/reading pipeline Discover's
  // "Start reading" uses -- the reading UI rendering the *saved book's own* source text on
  // "/" (translations show on tap/hover, not inline, so this -- not the mocked "Hello" --
  // is the reliable signal) confirms the click actually reached
  // handleLibraryStartReading/handleTextSubmit rather than no-oping.
  await expect(page).toHaveURL("/")
  await expect(page.getByText(/Había una vez un zorro/)).toBeVisible({ timeout: 10_000 })
})

test("removing a saved book takes it out of the list", async ({ page }) => {
  await setupMocks(page, {
    restTables: {
      user_epubs: [
        {
          id: "mock-epub-2",
          title: "Libro a Borrar",
          file_name: "borrar.epub",
          char_count: 10,
          body_text: "Texto.",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
    },
  })

  await page.goto("/library")
  await expect(page.getByText("Libro a Borrar").first()).toBeVisible()

  // The delete button only renders into the DOM's hover/focus-visible tools slot -- force the
  // click since Playwright's real-hover simulation on a non-pointer CI runner is flaky for
  // hover-revealed controls, same tradeoff Discover's own dev-only delete button would hit.
  await page.getByRole("button", { name: /remove libro a borrar/i }).click({ force: true })

  await expect(page.getByText("Libro a Borrar")).toHaveCount(0)
  await expect(page.getByText("No books yet")).toBeVisible()
})
