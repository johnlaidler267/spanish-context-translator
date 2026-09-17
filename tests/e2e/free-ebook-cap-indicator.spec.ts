/**
 * Free-tier ebook reading-cap indicator (LexaLens board card "Add ebook reading cap
 * indicator upgrade prompt"). Reproduces + confirms in the same spec since there was
 * nothing to repro (this is new UI, not a bug fix): a free user reading a saved
 * multi-page Library ebook sees a "N free pages left" pill in the reading toolbar
 * linking to /upgrade, and a Pro user reading the same book does not.
 *
 * Uses tests/e2e-mocks (see its README) instead of a real Supabase project/Groq key.
 */

import { test, expect } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

// Long enough (~300 words) to split into several desktop-sized (115 words/page)
// translate pages, well past 1 -- the indicator only shows once a book has more than
// one page (see `freeEbookPreview` in App.tsx: nothing to preview-gate on a book that
// already fits on a single page).
const LONG_BOOK_TEXT = Array.from(
  { length: 60 },
  (_, i) => `Esta es la oracion numero ${i + 1} del libro de prueba para la paginacion.`,
).join(" ")

const LIBRARY_BOOK = {
  id: "mock-epub-long",
  title: "Novela Larga de Prueba",
  file_name: "novela-larga.epub",
  char_count: LONG_BOOK_TEXT.length,
  body_text: LONG_BOOK_TEXT,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
}

test("free-tier user sees the remaining-pages indicator and upgrade link while reading a library ebook", async ({
  page,
}) => {
  await setupMocks(page, {
    subscription: { status: null, plan_id: null, past_due_since: null },
    restTables: { user_epubs: [LIBRARY_BOOK] },
  })

  await page.goto("/library")
  await page.getByText("Novela Larga de Prueba").first().click()
  await page.getByRole("button", { name: "Start reading" }).click()

  await expect(page).toHaveURL("/", { timeout: 15_000 })
  // Confirms we're actually on a multi-page book, not just that the pill happened to
  // render -- "Page 1 of" only appears once pagination is active (pageCount > 1).
  await expect(page.getByText(/Page/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/of\s+\d/)).toBeVisible()

  const pill = page.getByRole("link", { name: /free page.*left.*upgrade/i })
  await expect(pill).toBeVisible()
  await expect(pill).toHaveAttribute("href", "/upgrade")
  await expect(pill.getByText(/free pages? left/)).toBeVisible()
})

test("Pro-tier user does not see the reading-cap indicator on the same book", async ({ page }) => {
  await setupMocks(page, {
    subscription: { status: "active", plan_id: "pro", past_due_since: null },
    restTables: { user_epubs: [LIBRARY_BOOK] },
  })

  await page.goto("/library")
  await page.getByText("Novela Larga de Prueba").first().click()
  await page.getByRole("button", { name: "Start reading" }).click()

  await expect(page).toHaveURL("/", { timeout: 15_000 })
  await expect(page.getByText(/Page/).first()).toBeVisible({ timeout: 15_000 })

  await expect(page.getByRole("link", { name: /free page.*left/i })).toHaveCount(0)
})

test("mobile viewport: indicator stays compact and doesn't collide with toolbar controls", async ({ browser }) => {
  // Reproduced during development: the desktop pill is horizontally centered in the same row as
  // the toolbar's control rail, which is wide enough on a phone-width screen that the two
  // overlapped. The mobile layout instead drops the pill to its own row under the main bar (see
  // reading-header.tsx) -- assert their boxes don't overlap so a future change can't reintroduce it.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await setupMocks(page, {
    subscription: { status: null, plan_id: null, past_due_since: null },
    restTables: { user_epubs: [LIBRARY_BOOK] },
  })
  await page.goto("/library")
  await page.getByText("Novela Larga de Prueba").first().click()
  await page.getByRole("button", { name: "Start reading" }).click()
  await expect(page).toHaveURL("/", { timeout: 15_000 })
  await expect(page.getByText(/Page/).first()).toBeVisible({ timeout: 15_000 })

  const pill = page.getByRole("link", { name: /free page.*left.*upgrade/i })
  await expect(pill).toBeVisible()
  const controlRail = page.locator(".theme-toggle-btn").locator("..")
  const [pillBox, railBox] = await Promise.all([pill.boundingBox(), controlRail.boundingBox()])
  expect(pillBox).not.toBeNull()
  expect(railBox).not.toBeNull()
  const overlaps =
    pillBox!.x < railBox!.x + railBox!.width &&
    pillBox!.x + pillBox!.width > railBox!.x &&
    pillBox!.y < railBox!.y + railBox!.height &&
    pillBox!.y + pillBox!.height > railBox!.y
  expect(overlaps).toBe(false)

  await context.close()
})
