/**
 * Reopening a book must never lose the reader's place to the free-plan preview cap.
 *
 * The bug: until the plan check finished (it stops blocking the app after 3s) -- or whenever
 * it failed, which used to read as "free" -- a paid reader tapping a book was treated as free,
 * so the book opened on the free preview's last page (page 10) instead of where they left off.
 * That page was then saved as their position, locally and in the cloud, so every later visit
 * also resumed near the start.
 */

import { test, expect, type Page } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

const BOOK_TEXT = Array.from(
  { length: 3000 },
  (_, i) => `La frase número ${i + 1} cuenta cómo el zorro corría por el bosque al amanecer.`,
).join(" ")

const SAVED_PAGE_INDEX = 60 // "Page 61"

async function mockBookAt(page: Page, subscription: Record<string, unknown> | null) {
  await setupMocks(page, {
    ...(subscription ? { subscription } : {}),
    restTables: {
      user_epubs: [
        {
          id: "b1",
          title: "Libro Largo",
          file_name: "libro.epub",
          char_count: BOOK_TEXT.length,
          body_text: BOOK_TEXT,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      reading_progress: [
        { content_id: "b1", page_index: SAVED_PAGE_INDEX, total_pages: 400, updated_at: "2024-01-01T00:00:00.000Z" },
      ],
    },
  })
}

/** Opens the book from the Library and returns the "Page X of Y" it landed on. */
async function openBook(page: Page): Promise<string> {
  await page.getByText("Libro Largo").first().click()
  await page.getByRole("button", { name: /reading/ }).click()
  const indicator = page.getByText(/^Page \d+ of \d+$/)
  await expect(indicator).toBeVisible({ timeout: 20_000 })
  return indicator.innerText()
}

function savedPageIndex(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("lector-reading-progress") ?? "{}") as Record<
      string,
      Record<string, { pageIndex: number }>
    >
    for (const scoped of Object.values(all)) if (scoped.b1) return scoped.b1.pageIndex
    return null
  })
}

test.describe("a paid reader", () => {
  const PRO = { status: "active", plan_id: "pro", past_due_since: null }

  test("resumes at their real place while the plan check is still slow", async ({ page }) => {
    test.setTimeout(90_000)
    await mockBookAt(page, PRO)
    await page.route("**/rest/v1/user_subscriptions**", async (route) => {
      await new Promise((r) => setTimeout(r, 8000))
      return route.fallback()
    })
    await page.goto("/library", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3500) // app has stopped waiting on the plan check; plan still unknown
    expect(await openBook(page)).toMatch(/^Page 61 of /)
    await page.waitForTimeout(2000)
    expect(await savedPageIndex(page)).toBe(SAVED_PAGE_INDEX)
  })

  test("resumes at their real place when the plan check fails", async ({ page }) => {
    test.setTimeout(90_000)
    await mockBookAt(page, PRO)
    await page.route("**/rest/v1/user_subscriptions**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' }),
    )
    await page.goto("/library", { waitUntil: "domcontentloaded" })
    expect(await openBook(page)).toMatch(/^Page 61 of /)
  })
})

test("a free reader still opens within the preview, but their real place is kept", async ({ page }) => {
  test.setTimeout(90_000)
  let pushedPageIndexes: number[] = []
  await mockBookAt(page, null) // no subscription row = free plan
  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/reading_progress") && req.method() === "POST") {
      const body = req.postDataJSON() as { page_index?: number } | { page_index?: number }[]
      for (const row of Array.isArray(body) ? body : [body]) {
        if (typeof row.page_index === "number") pushedPageIndexes.push(row.page_index)
      }
    }
  })
  await page.goto("/library", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("Libro Largo").first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1000) // let the plan check land as "free"

  expect(await openBook(page)).toMatch(/^Page 10 of /)
  // Past the cloud push's 1.5s debounce: the cap page must not have been saved anywhere.
  await page.waitForTimeout(2500)
  expect(await savedPageIndex(page)).toBe(SAVED_PAGE_INDEX)
  expect(pushedPageIndexes).toEqual([])

  // Actually turning a page is real reading, and is saved as usual.
  pushedPageIndexes = []
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true })
  while ((await dismiss.count()) > 0) await dismiss.last().click()
  // The mocked translation doesn't fit this text, so the first tap's page load fails and leaves
  // the reader where it is; a second tap goes straight to the (now cached-as-failed) page.
  await expect(async () => {
    await page.getByRole("button", { name: "Previous page" }).click()
    await expect(page.getByText(/^Page 9 of \d+$/)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect.poll(() => savedPageIndex(page)).toBe(8)
})
