/**
 * Words page progress card: "N of M words learned", a bar and key split by practice status
 * (learned / learning / due / new, matching the filter chips), and "+N this week" for words
 * saved in the last 7 days. All computed from the saved words already loaded.
 */

import { test, expect } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

const DAY = 86_400_000
const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString()
const reviewed = (stage: number, dueInDays: number) => ({
  review_stage: stage,
  due_at: iso(dueInDays),
  last_reviewed_at: iso(-1),
  review_count: stage + 1,
  lapse_count: 0,
})

// 2 learned, 1 learning, 1 due, 2 new; 2 of them saved this week.
const ROWS = [
  { word: "zorro", created_at: iso(-40), ...reviewed(5, 20) },
  { word: "bosque", created_at: iso(-30), ...reviewed(4, 16) },
  { word: "orilla", created_at: iso(-20), ...reviewed(2, 3) },
  { word: "sendero", created_at: iso(-10), ...reviewed(1, -1) },
  { word: "madrugada", created_at: iso(-2) },
  { word: "susurro", created_at: iso(-0.1) },
].map((w, i) => ({
  id: `w${i}`,
  user_id: "00000000-0000-4000-8000-000000000001",
  language: "spanish",
  meaning: "meaning",
  literal: null,
  sentence: null,
  source_title: "El Principito",
  ...w,
}))

test("the Words page shows how many words are learned, by status, and saved this week", async ({ page }) => {
  await setupMocks(page)
  await page.route("**/rest/v1/saved_words**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }),
  )
  await page.goto("/words")

  const card = page.getByTestId("words-progress")
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText("2of 6 words learned")
  await expect(card).toContainText("+2 this week")
  for (const part of ["2 learned", "1 learning", "1 due", "2 new"]) {
    await expect(card).toContainText(part)
  }
})
