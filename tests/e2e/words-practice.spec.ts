/**
 * Practice: fill-in-the-blank rounds over saved words. A missed word comes back at the end of
 * the round, the summary counts first-try answers, each answer saves the word's review
 * schedule, and a new round can be started from the summary.
 */

import { test, expect, type Page } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

type Row = Record<string, unknown>

const USER_ID = "00000000-0000-4000-8000-000000000001"
const WORDS: Row[] = [
  { word: "zorro", meaning: "fox", sentence: "El zorro corría por el bosque.", source_title: "Cuentos de la selva" },
  { word: "detuvo", meaning: "stopped", sentence: "De repente, se detuvo junto al río.", source_title: "Cuentos de la selva" },
  { word: "Adiós.", meaning: "Goodbye.", sentence: "Adiós.", source_title: null },
].map((w, i) => ({
  id: `word-${i + 1}`,
  user_id: USER_ID,
  language: "spanish",
  literal: null,
  created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
  ...w,
}))
const ANSWER_BY_MEANING: Record<string, string> = { fox: "zorro", stopped: "detuvo", "Goodbye.": "adios" }

/** `saved_words` with the review columns: list and PATCH-by-id (records each update). */
async function mockSavedWords(page: Page) {
  const rows = WORDS.map((r) => ({ ...r }))
  const updates: Row[] = []
  await page.route("**/rest/v1/saved_words**", async (route) => {
    const req = route.request()
    if (req.method() === "PATCH") {
      const id = new URL(req.url()).searchParams.get("id")?.replace(/^eq\./, "")
      const body = req.postDataJSON() as Row
      updates.push({ id, ...body })
      Object.assign(rows.find((r) => r.id === id) ?? {}, body)
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) })
  })
  return updates
}

async function currentAnswer(page: Page) {
  const meaning = (await page.getByTestId("practice-meaning").textContent())!.replace(/[“”]/g, "")
  return ANSWER_BY_MEANING[meaning]
}

test("practice a round: blanks in context, missed words come back, then start a new round", async ({ page }) => {
  await setupMocks(page)
  const updates = await mockSavedWords(page)

  await page.goto("/words")
  await page.getByRole("link", { name: "Practice" }).click()
  await expect(page).toHaveURL(/\/words\/practice$/)
  await expect(page.getByText("1 of 3")).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: "test-results/practice-card.png" })

  // First card: answer right (no accents needed).
  const input = page.getByLabel("Your answer")
  await input.fill(await currentAnswer(page))
  await input.press("Enter")
  await expect(page.getByRole("status")).toContainText(/Correct|accents/)
  await page.screenshot({ path: "test-results/practice-correct.png" })
  await page.getByRole("button", { name: "Continue" }).click()

  // Second card: give up; it should come back at the end.
  await expect(page.getByText("2 of 3")).toBeVisible()
  const missed = await currentAnswer(page)
  await page.getByRole("button", { name: "Show answer" }).click()
  await expect(page.getByRole("status")).toContainText("The answer was")
  await expect(page.getByText("2 of 3")).toBeVisible()
  await page.screenshot({ path: "test-results/practice-missed.png" })
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByText("3 of 3")).toBeVisible()
  await input.fill(await currentAnswer(page))
  await input.press("Enter")
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByText("Once more")).toBeVisible()
  expect(await currentAnswer(page)).toBe(missed)
  await input.fill(missed)
  await input.press("Enter")
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByText("Round complete")).toBeVisible()
  await expect(page.getByText("2 of 3 right on the first try.")).toBeVisible()
  await page.screenshot({ path: "test-results/practice-summary.png" })

  // One saved schedule per word -- the retry doesn't reschedule it again.
  expect(updates).toHaveLength(3)
  expect(updates.filter((u) => u.review_stage === 1)).toHaveLength(2)
  expect(updates.filter((u) => u.review_stage === 0)).toHaveLength(1)

  await page.getByRole("button", { name: "Start a new round" }).click()
  await expect(page.getByText("1 of 3")).toBeVisible()
})

test("accent keys type the letter at the caret without taking focus off the answer", async ({ page }) => {
  await setupMocks(page)
  await mockSavedWords(page)

  await page.goto("/words/practice")
  await expect(page.getByText("1 of 3")).toBeVisible({ timeout: 20_000 })
  const input = page.getByLabel("Your answer")
  const keys = page.getByRole("group", { name: "Insert accented letter" })
  await expect(keys.getByRole("button")).toHaveText(["á", "é", "í", "ó", "ú", "ñ", "ü"])

  await input.pressSequentially("ni")
  await keys.getByRole("button", { name: "ñ" }).click()
  await expect(input).toHaveValue("niñ")
  await expect(input).toBeFocused()

  // Inserts where the caret is, not just at the end.
  await input.press("Home")
  await keys.getByRole("button", { name: "á" }).click()
  await input.pressSequentially("x")
  await expect(input).toHaveValue("áxniñ")
  await page.screenshot({ path: "test-results/practice-accent-keys.png" })

  // Gone once the answer is checked.
  await page.getByRole("button", { name: "Show answer" }).click()
  await expect(keys).toHaveCount(0)
})
