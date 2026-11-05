/**
 * Uploaded books are tagged with the language they're written in (detect-book-language.ts,
 * supabase/migrations/0034_user_epub_language.sql), and the Library only shows the ones in the
 * language being learned -- plus untagged ones, which show everywhere. An upload in another
 * language asks to switch languages instead of opening in the wrong mode.
 */

import JSZip from "jszip"
import { test, expect, type Page } from "@playwright/test"
import { setupMocks, MOCK_SUPABASE_URL } from "../e2e-mocks/supabase-mock"

function bookRow(id: string, title: string, language: string | null) {
  return {
    id,
    title,
    file_name: `${id}.epub`,
    char_count: 10,
    body_text: "Texto.",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    author: null,
    description: null,
    story_start_offset: 0,
    language,
  }
}

const BOOKS = [
  bookRow("es-book", "Libro Español", "spanish"),
  bookRow("fr-book", "Livre Français", "french"),
  bookRow("untagged-book", "Untagged Book", null),
]

async function setLearning(page: Page, learning: "spanish" | "french") {
  await setupMocks(page, { restTables: { user_epubs: BOOKS }, languagePrefs: { learning, native: "english" } })
}

test("the Library shows only uploads in the language being learned, plus untagged ones", async ({ page }) => {
  await setLearning(page, "french")
  await page.goto("/library")
  await expect(page.getByText("Livre Français").first()).toBeVisible()
  await expect(page.getByText("Untagged Book").first()).toBeVisible()
  await expect(page.getByText("Libro Español")).toHaveCount(0)
})

test("switching back to Spanish shows the Spanish upload again", async ({ page }) => {
  await setLearning(page, "spanish")
  await page.goto("/library")
  await expect(page.getByText("Libro Español").first()).toBeVisible()
  await expect(page.getByText("Untagged Book").first()).toBeVisible()
  await expect(page.getByText("Livre Français")).toHaveCount(0)
})

const SPANISH_PARAGRAPH =
  "Cuando llegó a la casa, el perro estaba dormido en el jardín. Los niños jugaban con una pelota " +
  "por la calle, pero su madre los llamó para comer. Había muy poca comida, y ella estaba cansada " +
  "porque el día fue largo. Yo creo que es mejor así, dijo él, como siempre."

async function spanishEpub(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  )
  // Metadata claims English, as many tools stamp by default -- the text should win.
  zip.file(
    "content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Mi Libro Nuevo</dc:title><dc:language>en</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,
  )
  const body = Array.from({ length: 4 }, () => `<p>${SPANISH_PARAGRAPH}</p>`).join("")
  zip.file("c1.xhtml", `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`)
  return zip.generateAsync({ type: "nodebuffer" })
}

test("uploading a Spanish book in French mode tags it Spanish and offers to switch", async ({ page }) => {
  await setupMocks(page, { restTables: { user_epubs: [] }, languagePrefs: { learning: "french", native: "english" } })
  let insertedLanguage: unknown = "not inserted"
  let bookTextFetched = false
  await page.route(`${MOCK_SUPABASE_URL}/rest/v1/user_epubs**`, async (route) => {
    // Opening the new book fetches its saved text back by id.
    if (route.request().method() === "GET" && route.request().url().includes("new-book")) {
      bookTextFetched = true
      const text = Array.from({ length: 4 }, () => SPANISH_PARAGRAPH).join("\n\n")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ title: "Mi Libro Nuevo", body_text: text }]),
      })
    }
    if (route.request().method() !== "POST") return route.fallback()
    insertedLanguage = (route.request().postDataJSON() as { language?: unknown }).language
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "new-book" }) })
  })

  await page.goto("/library")
  await page.locator('input[type="file"]').setInputFiles({
    name: "nuevo.epub",
    mimeType: "application/epub+zip",
    buffer: await spanishEpub(),
  })

  await expect(page.getByRole("dialog", { name: "This book is in Spanish" })).toBeVisible()
  expect(insertedLanguage).toBe("spanish")

  await page.getByRole("button", { name: "Switch to Spanish" }).click()
  // Switching opens the book: its saved text is fetched for the reading pipeline. (Not checked
  // further -- the mocked translator only has replies for other specs' text.)
  await expect.poll(() => bookTextFetched).toBe(true)
  const prefs = await page.evaluate(() => localStorage.getItem("lector-language-learning-preferences"))
  expect(JSON.parse(prefs!).learning).toBe("spanish")
})

test("changing a book's language in its popup moves it out of this language's Library", async ({ page }) => {
  await setLearning(page, "french")
  let patched: unknown = null
  await page.route(`${MOCK_SUPABASE_URL}/rest/v1/user_epubs**`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback()
    patched = route.request().postDataJSON()
    return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "fr-book" }]) })
  })

  await page.goto("/library")
  await page.getByText("Livre Français").first().click()
  const picker = page.getByRole("combobox", { name: "Book language" })
  await expect(picker).toHaveValue("french")
  await picker.selectOption("spanish")

  await expect.poll(() => patched).toEqual({ language: "spanish" })
  await page.keyboard.press("Escape")
  await expect(page.getByText("Livre Français")).toHaveCount(0)
})
