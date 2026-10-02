/**
 * Saved words: a reader saves a word from the word-details sheet (bookmark button), it shows
 * up on the Words page with its meaning and the sentence it came from, and can be removed
 * there. Signed-out visitors are asked to sign in instead.
 */

import { test, expect, type Page } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

type Row = Record<string, unknown>

/** A tiny in-memory `saved_words` table: list, upsert (returns the row), delete by id. */
async function mockSavedWordsTable(page: Page, initial: Row[] = []) {
  const rows: Row[] = [...initial]
  await page.route("**/rest/v1/saved_words**", async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === "POST") {
      const body = req.postDataJSON() as Row
      const existing = rows.find((r) => r.language === body.language && r.word === body.word)
      const row: Row = existing
        ? Object.assign(existing, body)
        : {
            id: `word-${rows.length + 1}`,
            user_id: "00000000-0000-4000-8000-000000000001",
            created_at: new Date().toISOString(),
            ...body,
          }
      if (!existing) rows.unshift(row)
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) })
    }
    if (method === "DELETE") {
      const id = new URL(req.url()).searchParams.get("id")?.replace(/^eq\./, "")
      const at = rows.findIndex((r) => r.id === id)
      if (at >= 0) rows.splice(at, 1)
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) })
  })
  return rows
}

test("save a word while reading, find it on the Words page, and remove it", async ({ page }) => {
  await setupMocks(page, {
    groqChatContent: JSON.stringify([
      { c: "Hola.", m: "Hello." },
      { c: "Adiós.", m: "Goodbye." },
    ]),
  })
  const rows = await mockSavedWordsTable(page)

  await page.goto("/")
  await page.locator("textarea").fill("Hola. Adiós.")
  await page.getByRole("button", { name: "Start reading" }).click()

  // Desktop click on a word opens the details sheet; its bookmark saves the word.
  await page.locator("[data-chunk]").first().click()
  await page.getByRole("button", { name: "Save word" }).click()
  await expect(page.getByRole("button", { name: "Remove from saved words" })).toHaveAttribute("aria-pressed", "true")
  // ...and the word is marked in the text straight away.
  await expect(page.locator("[data-chunk]").first().locator("[data-saved-word]")).toHaveCount(1)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ language: "spanish", meaning: "Hello.", sentence: "Hola." })

  await page.getByRole("button", { name: "Close details" }).click()
  await page.getByRole("button", { name: "Back" }).first().click()
  await page.getByRole("link", { name: "Words" }).first().click()
  await expect(page).toHaveURL(/\/words$/)
  await expect(page.getByRole("heading", { name: "Words" })).toBeVisible()
  const word = String(rows[0].word)
  // The word shows twice: as the row's headword and bolded inside its saved sentence.
  await expect(page.getByText(word, { exact: true }).first()).toBeVisible()
  await expect(page.locator("strong", { hasText: word })).toBeVisible()
  await expect(page.getByText("Hello.")).toBeVisible()

  // Removing hides the word straight away but holds off deleting it so it can be undone...
  await page.getByRole("button", { name: `Remove ${word}` }).click()
  await expect(page.getByText(/No saved Spanish words yet/)).toBeVisible()
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.locator("strong", { hasText: word })).toBeVisible()
  expect(rows).toHaveLength(1)

  // ...and deletes it for real once the undo window runs out.
  await page.getByRole("button", { name: `Remove ${word}` }).click()
  await expect(page.getByText(/No saved Spanish words yet/)).toBeVisible()
  await expect.poll(() => rows.length, { timeout: 10_000 }).toBe(0)
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0)
})

test("the Words page shows practice status, and can be searched and filtered", async ({ page }) => {
  await setupMocks(page)
  const base = {
    user_id: "00000000-0000-4000-8000-000000000001",
    language: "spanish",
    review_count: 0,
    lapse_count: 0,
  }
  const day = 24 * 60 * 60 * 1000
  await mockSavedWordsTable(page, [
    {
      ...base,
      id: "w1",
      word: "por lo que",
      meaning: "which is why",
      source_title: "Maniac",
      created_at: "2026-03-01T00:00:00.000Z",
      review_stage: 1,
      due_at: new Date(Date.now() - day).toISOString(),
    },
    {
      ...base,
      id: "w2",
      word: "adiós",
      meaning: "goodbye",
      created_at: "2026-02-01T00:00:00.000Z",
      review_stage: 5,
      due_at: new Date(Date.now() + 30 * day).toISOString(),
    },
    {
      ...base,
      id: "w3",
      word: "quedarse con",
      meaning: "keep",
      created_at: "2026-01-01T00:00:00.000Z",
      review_stage: 0,
      due_at: null,
    },
  ])

  await page.goto("/words")
  const statusFilter = page.getByRole("group", { name: "Filter by practice status" })
  await expect(statusFilter.getByRole("button")).toHaveText(["All 3", "Due 1", "New 1", "Learning 0", "Learned 1"], {
    timeout: 20_000,
  })

  const rows = page.locator("main li")
  await page.getByRole("button", { name: /^Due/ }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText("por lo que")

  await page.getByRole("button", { name: /^All/ }).click()
  await page.getByRole("searchbox", { name: "Search saved words" }).fill("adios")
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText("Learned")
})

test("signed-out visitors are asked to sign in on the Words page", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/words")
  await expect(page.getByText("Sign in to save words while you read")).toBeVisible({ timeout: 20_000 })
})

test("words saved earlier are marked in the text when you read", async ({ page }) => {
  await setupMocks(page, {
    groqChatContent: JSON.stringify([
      { c: "Hola.", m: "Hello." },
      { c: "Adiós.", m: "Goodbye." },
    ]),
  })
  await mockSavedWordsTable(page, [
    {
      id: "word-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      language: "spanish",
      word: "adiós",
      meaning: "Goodbye.",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ])

  await page.goto("/")
  await page.locator("textarea").fill("Hola. Adiós.")
  await page.getByRole("button", { name: "Start reading" }).click()

  const chunks = page.locator("[data-chunk]")
  await expect(chunks.nth(1).locator("[data-saved-word]")).toHaveCount(1, {
    timeout: 20_000,
  })
  await expect(chunks.nth(0).locator("[data-saved-word]")).toHaveCount(0)
})
