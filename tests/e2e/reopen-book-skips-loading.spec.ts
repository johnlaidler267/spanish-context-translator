/**
 * Reopening a book already opened on this device must skip the loading overlay: its page layout
 * is saved on-device after the first open (src/lib/storage/book-layout-cache.ts), so the reopen
 * needs neither the text download nor the full-book pagination pass that the overlay exists to
 * cover. The first open still shows the overlay, and the reopen must land on the same page.
 */

import { test, expect, type Page } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

// Long enough to paginate into many pages, so resuming mid-book is a real test of the saved layout.
const BOOK_TEXT = Array.from(
  { length: 400 },
  (_, i) => `La frase número ${i + 1} cuenta cómo el zorro corría por el bosque al amanecer.`,
).join(" ")

async function watchForOverlayAndLandingFlash(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sawOverlay: boolean; __sawLanding: boolean }
    w.__sawOverlay = false
    w.__sawLanding = false
    const check = () => {
      if (document.querySelector('[role="progressbar"]')) w.__sawOverlay = true
      if (document.querySelector(".landing-page")) w.__sawLanding = true
    }
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true })
  })
}

/** Layouts saved in IndexedDB (written in the background after a first open). */
function savedLayoutCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("lexa-book-layouts")
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains("layouts")) return resolve(0)
          const count = db.transaction("layouts").objectStore("layouts").count()
          count.onsuccess = () => resolve(count.result)
          count.onerror = () => resolve(0)
        }
        req.onerror = () => resolve(0)
      }),
  )
}

async function reopenScenario(page: Page) {
  await setupMocks(page, {
    restTables: {
      user_epubs: [
        {
          id: "mock-epub-1",
          title: "Mi Libro Guardado",
          file_name: "mi-libro-guardado.epub",
          char_count: BOOK_TEXT.length,
          body_text: BOOK_TEXT,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      reading_progress: [
        { content_id: "mock-epub-1", page_index: 3, total_pages: 10, updated_at: "2024-01-01T00:00:00.000Z" },
      ],
    },
  })
  let bodyTextFetches = 0
  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/user_epubs") && req.url().includes("body_text")) bodyTextFetches++
  })

  // First open: nothing saved yet, so the overlay covers the download + pagination as before.
  await page.goto("/library")
  await page.getByText("Mi Libro Guardado").first().click()
  await watchForOverlayAndLandingFlash(page)
  await page.getByRole("button", { name: "Continue reading" }).click()
  await expect(page.getByRole("progressbar", { name: "Translation progress" })).toBeVisible()
  // The mocked translation doesn't line up with this text, so the page's own translation
  // fails -- irrelevant here; the page indicator is what proves which page of which layout opened.
  const pageIndicator = page.getByText(/^Page \d+ of \d+$/)
  await expect(pageIndicator).toBeVisible({ timeout: 15_000 })
  const firstOpenIndicator = await pageIndicator.innerText()
  expect(firstOpenIndicator).toMatch(/^Page 4 of \d+$/)
  expect(bodyTextFetches).toBe(1)

  // Wait for the layout to land in IndexedDB (written in the background after the first open).
  await expect.poll(() => savedLayoutCount(page)).toBe(1)

  // Clear whatever's on top of the reader: the "where you left off" card, and the failed
  // translation notice (see above).
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true })
  while ((await dismiss.count()) > 0) await dismiss.last().click()
  await page.getByRole("button", { name: "Back" }).first().click()
  await expect(page).toHaveURL(/\/library$/)

  // Reopen: straight into the book, with no overlay, no landing-page flash on the way, and no
  // second download of the text.
  await page.getByText("Mi Libro Guardado").first().click()
  await watchForOverlayAndLandingFlash(page)
  const tappedAt = Date.now()
  await page.getByRole("button", { name: "Continue reading" }).click()
  await expect(pageIndicator).toBeVisible({ timeout: 5_000 })
  const reopenMs = Date.now() - tappedAt
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __sawOverlay: boolean; __sawLanding: boolean }
    return { overlay: w.__sawOverlay, landing: w.__sawLanding }
  })
  expect(seen.overlay).toBe(false)
  expect(seen.landing).toBe(false)
  expect(bodyTextFetches).toBe(1)
  expect(await pageIndicator.innerText()).toBe(firstOpenIndicator)
  console.log(`reopen took ${reopenMs}ms`)
}

test("reopening a book skips the loading overlay and the text download, and resumes on the same page", async ({
  page,
}) => {
  await reopenScenario(page)
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test("reopening a book skips the loading overlay and resumes on the same page", async ({ page }) => {
    await reopenScenario(page)
  })
})

test("reopening a Discover book skips the loading overlay and the text download", async ({ page }) => {
  await setupMocks(page, {
    discoverItems: [
      {
        id: "mock-item-1",
        title: "El Principito",
        author: "Antoine de Saint-Exupéry",
        type: "book",
        difficulty: "beginner",
        word_count: 5000,
        language: "Spanish",
        cover_image: "",
        tags: ["Classic"],
        preview: "La frase número 1 cuenta cómo el zorro corría por el bosque al amanecer.",
        body_text: BOOK_TEXT,
        estimated_time: "1 hour",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ],
  })
  let bodyTextFetches = 0
  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/discover_items") && req.url().includes("select=body_text")) bodyTextFetches++
  })
  const pageIndicator = page.getByText(/^Page \d+ of \d+$/)
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true })

  await page.goto("/discover")
  await page.getByText("El Principito").first().click()
  await watchForOverlayAndLandingFlash(page)
  await page.getByRole("button", { name: /reading/ }).click()
  await expect(page.getByRole("progressbar", { name: "Translation progress" })).toBeVisible()
  await expect(pageIndicator).toBeVisible({ timeout: 15_000 })
  expect(bodyTextFetches).toBe(1)
  await expect.poll(() => savedLayoutCount(page)).toBe(1)
  while ((await dismiss.count()) > 0) await dismiss.last().click()
  await page.getByRole("button", { name: "Back" }).first().click()
  await expect(page).toHaveURL(/\/discover$/)

  await page.getByText("El Principito").first().click()
  await watchForOverlayAndLandingFlash(page)
  await page.getByRole("button", { name: /reading/ }).click()
  await expect(pageIndicator).toBeVisible({ timeout: 5_000 })
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __sawOverlay: boolean; __sawLanding: boolean }
    return { overlay: w.__sawOverlay, landing: w.__sawLanding }
  })
  expect(seen).toEqual({ overlay: false, landing: false })
  expect(bodyTextFetches).toBe(1)
})
