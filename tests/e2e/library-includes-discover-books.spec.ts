/**
 * A Discover book joins My Library automatically once the reader has started it, opens from
 * there like any other Library book, and can be removed again (which forgets its reading place,
 * locally and in the cloud, so the next sync doesn't bring it back). Discover articles, songs
 * and poems stay out of the Library.
 */

import { test, expect } from "@playwright/test"
import { CHAT_EDGE_FUNCTIONS_GLOB, setupMocks } from "../e2e-mocks/supabase-mock"

const BOOK_TEXT = Array.from(
  { length: 200 },
  (_, i) => `La frase número ${i + 1} cuenta cómo el zorro corría por el bosque al amanecer.`,
).join(" ")

const DISCOVER_BOOK = {
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
}

const DISCOVER_SONG = {
  ...DISCOVER_BOOK,
  id: "mock-item-2",
  title: "Despacito",
  author: "Luis Fonsi",
  type: "song",
  body_text: "Sí, sabes que ya llevo un rato mirándote.",
}

test("a Discover book shows up in My Library once it's been read, and can be removed", async ({ page }) => {
  test.setTimeout(90_000)
  await setupMocks(page, {
    discoverItems: [DISCOVER_BOOK, DISCOVER_SONG],
    restTables: {
      user_epubs: [],
      // Already started the song -- it still must not appear in the Library.
      reading_progress: [
        { content_id: "mock-item-2", page_index: 0, total_pages: 1, updated_at: "2024-01-01T00:00:00.000Z" },
      ],
    },
  })
  // The default table mock returns every row for any query; the reader's single-item body_text
  // fetch needs exactly this one.
  await page.route("**/rest/v1/discover_items**id=eq.mock-item-1**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([DISCOVER_BOOK]),
    }),
  )
  // Echo each page back as one chunk so translation succeeds for this long book -- the harness's
  // fixed two-chunk reply doesn't reconcile against it, and the "Translation failed" dialog it
  // raises would sit over the reader's Back button.
  await page.route(CHAT_EDGE_FUNCTIONS_GLOB, async (route) => {
    const body = route.request().postDataJSON() as { messages?: Array<{ role: string; content: string }> }
    const userContent = body?.messages?.find((m) => m.role === "user")?.content ?? ""
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify([{ c: userContent.split("TEXT:\n").pop() ?? userContent, m: "Translation." }]),
            },
            finish_reason: "stop",
          },
        ],
      }),
    })
  })
  const progressDeletes: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/reading_progress") && req.method() === "DELETE") progressDeletes.push(req.url())
  })

  // Before reading anything, the Library is empty (the started song doesn't count).
  await page.goto("/library", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("No books yet")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("Despacito")).toHaveCount(0)

  // Read the book from Discover.
  await page.goto("/discover", { waitUntil: "domcontentloaded" })
  await page.getByText("El Principito").first().click()
  await page.getByRole("button", { name: /reading/ }).click()
  await expect(page.getByText(/^Page \d+ of \d+$/)).toBeVisible({ timeout: 20_000 })

  // It's now in the Library, without the reader having done anything else.
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true })
  while ((await dismiss.count()) > 0) await dismiss.last().click()
  await page.getByRole("button", { name: "Back" }).first().click()
  await page.getByRole("link", { name: "My Library" }).first().click()
  await expect(page).toHaveURL(/\/library$/)
  await expect(page.getByText("El Principito").first()).toBeVisible()
  await expect(page.getByText("No books yet")).toHaveCount(0)
  await expect(page.getByText("Despacito")).toHaveCount(0)

  // Opening it from the Library goes into the reader.
  await page.getByText("El Principito").first().click()
  await page.getByRole("button", { name: "Continue reading" }).click()
  await expect(page.getByText(/^Page \d+ of \d+$/)).toBeVisible({ timeout: 20_000 })
  while ((await dismiss.count()) > 0) await dismiss.last().click()
  await page.getByRole("button", { name: "Back" }).first().click()
  await expect(page).toHaveURL(/\/library$/)

  // Removing it takes it out of the Library and deletes the cloud reading-progress row too.
  await page.getByRole("button", { name: "Remove El Principito from your library" }).click()
  await expect(page.getByText("No books yet")).toBeVisible()
  await expect.poll(() => progressDeletes.some((u) => u.includes("content_id=eq.mock-item-1"))).toBe(true)
})
