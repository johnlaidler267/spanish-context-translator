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
  await page.getByRole("link", { name: "Practice", exact: true }).click()
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

  // Enter checks the answer, and Enter again moves on.
  await expect(page.getByText("3 of 3")).toBeVisible()
  await input.fill(await currentAnswer(page))
  await input.press("Enter")
  await expect(page.getByRole("status")).toBeVisible()
  await page.keyboard.press("Enter")

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

test("a wrong answer can be marked right, explained, and the round ends with confetti", async ({ page }) => {
  await setupMocks(page)
  const updates = await mockSavedWords(page)
  const trickRequests: Row[] = []
  await page.route("**/functions/v1/chunk-memory-trick", async (route) => {
    trickRequests.push(route.request().postDataJSON() as Row)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trick: "Think of a sly fox called Zorro slipping through the woods." }),
    })
  })

  await page.goto("/words/practice")
  await expect(page.getByText("1 of 3")).toBeVisible({ timeout: 20_000 })
  const input = page.getByLabel("Your answer")

  // A slip of the keyboard: marked wrong, then overridden.
  const first = await currentAnswer(page)
  await input.fill("qqqq")
  await input.press("Enter")
  await expect(page.getByRole("status")).toContainText("The answer was")
  await page.getByRole("button", { name: "Explain" }).click()
  await expect(page.getByTestId("practice-explanation")).toContainText("sly fox")
  expect(trickRequests[0]).toMatchObject({ learning: "spanish" })
  await page.getByRole("button", { name: "I was right" }).click()
  await expect(page.getByRole("status")).toContainText("Marked as right")
  await expect(page.getByRole("button", { name: "I was right" })).toHaveCount(0)
  await page.screenshot({ path: "test-results/practice-overridden.png" })
  // Enter still moves on after clicking around the feedback.
  await page.keyboard.press("Enter")

  for (const n of [2, 3]) {
    await expect(page.getByText(`${n} of 3`)).toBeVisible()
    await input.fill(await currentAnswer(page))
    await input.press("Enter")
    await page.getByRole("button", { name: "Continue" }).click()
  }

  // The overridden word didn't come back for a retry and counts as right first time.
  await expect(page.getByText("Round complete")).toBeVisible()
  await expect(page.getByText("3 of 3 right on the first try.")).toBeVisible()
  await expect(page.getByTestId("confetti")).toBeAttached()
  await page.waitForTimeout(400)
  await page.screenshot({ path: "test-results/practice-confetti.png" })

  // Its saved schedule is the overridden one (wrong first, then right).
  const firstId = WORDS.find((w) => ANSWER_BY_MEANING[w.meaning as string] === first)!.id
  const saved = updates.filter((u) => u.id === firstId)
  expect(saved).toHaveLength(2)
  expect(saved[1].review_stage).toBe(1)
})

test("the Words page groups words by source, and Practice these practices only that source", async ({ page }) => {
  await setupMocks(page)
  await mockSavedWords(page)

  await page.goto("/words")
  const book = page.getByRole("region", { name: "Cuentos de la selva" })
  await expect(book.getByText("2 words")).toBeVisible({ timeout: 20_000 })
  await expect(book.getByRole("button", { name: "Remove zorro" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Other" }).getByRole("button", { name: "Remove Adiós." })).toBeVisible()

  // Search narrows the groups, too.
  await page.getByLabel("Search saved words").fill("adios")
  await expect(page.getByRole("region", { name: "Cuentos de la selva" })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Other" })).toBeVisible()
  await page.getByLabel("Search saved words").fill("")

  // Any other sort is one flat list.
  await page.getByLabel("Sort words").selectOption("alpha")
  await expect(page.getByRole("region")).toHaveCount(0)
  await page.getByLabel("Sort words").selectOption("source")

  await book.getByRole("link", { name: "Practice these" }).click()
  await expect(page).toHaveURL(/\/words\/practice\?source=Cuentos/)
  await expect(page.getByText("Words from Cuentos de la selva")).toBeVisible()
  await expect(page.getByText("1 of 2")).toBeVisible({ timeout: 20_000 })
})
