/**
 * Learn page: the landing's warm-up, a conjugation round (feedback names the slip, results list
 * the misses, "Practice my misses" re-asks them), the si-clause mini lesson end to end, and the
 * Spanish-only notice. Answers are looked up in the same verb table the app grades against.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

const FORMS = JSON.parse(readFileSync(join(process.cwd(), "src/lib/learn/verb-forms.json"), "utf8")) as Record<
  string,
  Record<string, string[]>
>
const PERSON_INDEX: Record<string, number> = {
  yo: 0,
  tú: 1,
  "él / ella / usted": 2,
  nosotros: 3,
  vosotros: 4,
  "ellos / ellas / ustedes": 5,
}

async function seedSettings(page: Page, settings: object) {
  await page.addInitScript((s) => localStorage.setItem("lexalens-learn-drill-settings", JSON.stringify(s)), settings)
}

/** The current bare drill question's verb and person (yo..ellos index). */
async function currentQuestion(page: Page) {
  const verb = (await page.getByTestId("drill-verb").textContent())!.trim()
  const person = PERSON_INDEX[(await page.getByTestId("drill-person").textContent())!.trim()]
  return { verb, person }
}

test("warm-up leads into a round; feedback names the slip; misses come back", async ({ page }) => {
  await setupMocks(page)
  await seedSettings(page, { tenses: ["preterite"], verbs: "common", mode: "bare" })
  await page.goto("/learn")

  await expect(page.getByRole("heading", { name: "One verb, every way you'll meet it." })).toBeVisible()
  const warmUp = page.getByRole("region", { name: "Warm-up question" })
  await warmUp.getByRole("button").first().click()
  await expect(warmUp.getByRole("status")).toContainText(/Nice\.|It's /)

  await warmUp.getByRole("button", { name: "Keep going: 10 more" }).click()
  await expect(page).toHaveURL(/\/learn\/conjugation$/)
  await expect(page.getByText("1 of 10")).toBeVisible()

  const answer = page.getByLabel("Your answer")
  let missedAnswer = ""
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText(`${i + 1} of 10`)).toBeVisible()
    const { verb, person } = await currentQuestion(page)
    const right = FORMS[verb].preterite[person]
    if (i === 0) {
      // Same verb and person, wrong tense: the feedback should say which tense it was.
      await answer.fill(FORMS[verb].imperfect[person])
      await answer.press("Enter")
      await expect(page.getByRole("status")).toContainText("That's the imperfect")
      missedAnswer = right
    } else {
      await answer.fill(right)
      await answer.press("Enter")
      await expect(page.getByRole("status")).toContainText("Correct")
    }
    await page.getByRole("button", { name: i === 9 ? "See results" : "Next" }).click()
  }

  await expect(page.getByText("Round complete")).toBeVisible()
  await expect(page.getByText("/ 10")).toBeVisible()
  await expect(page.locator("li").filter({ hasText: missedAnswer })).toBeVisible()

  await page.getByRole("button", { name: "Practice my misses" }).click()
  await expect(page.getByText("1 of 2")).toBeVisible()
  await page.getByRole("button", { name: "End round" }).click()

  // Back on setup: the round's answers show up as preterite accuracy (9 right, plus the warm-up maybe).
  await expect(page.getByRole("heading", { name: "Your tenses" })).toBeVisible()
  await expect(page.getByText("Preterite", { exact: true })).toBeVisible()
})

test("the si-clause lesson runs end to end and hands off to a one-off drill", async ({ page }) => {
  await setupMocks(page)
  await page.goto("/learn")
  await page.getByRole("link", { name: /Mini lessons/ }).click()
  await expect(page).toHaveURL(/\/learn\/lessons$/)
  await page.getByRole("link", { name: /If I had…/ }).click()

  await expect(page.getByRole("heading", { name: "Talking about what isn't true" })).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByRole("heading", { name: "Possible or imagined?" })).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByRole("button", { name: "era", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("It's fuera")
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByRole("button", { name: "iremos", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Correct")
  await page.getByRole("button", { name: "Continue" }).click()

  const answer = page.getByLabel("Your answer")
  await answer.fill("viviéramos")
  await answer.press("Enter")
  await expect(page.getByRole("status")).toContainText("Correct")
  await page.getByRole("button", { name: "Continue" }).click()
  await answer.fill("podía")
  await answer.press("Enter")
  await expect(page.getByRole("status")).toContainText("That's the imperfect")
  await page.getByRole("button", { name: "Continue" }).click()
  await answer.fill("comeria")
  await answer.press("Enter")
  await expect(page.getByRole("status")).toContainText("Right, just mind the accent")
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByText("Lesson complete")).toBeVisible()
  await expect(page.getByText("3 of 5 right on the first try.")).toBeVisible()

  await page.getByRole("button", { name: "Drill the imperfect subjunctive" }).click()
  await expect(page).toHaveURL(/\/learn\/conjugation$/)
  await expect(page.getByText("1 of 10")).toBeVisible()
  await expect(page.getByText("Imperfect subjunctive").first()).toBeVisible()
  // A one-off round: the reader's saved tense picks are untouched.
  expect(await page.evaluate(() => localStorage.getItem("lexalens-learn-drill-settings"))).toBeNull()
})

test("a choice-only lesson finishes, is ticked in the list, and moves Up next along", async ({ page }) => {
  await setupMocks(page)
  await page.goto("/learn")
  await expect(page.getByRole("link", { name: /Mini lessons/ })).toContainText("Up next: Ser or estar")

  await page.goto("/learn/lessons/por-para")
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByRole("button", { name: "Continue" }).click()
  for (const pick of ["para", "por", "para", "por"]) {
    await page.getByRole("button", { name: pick, exact: true }).click()
    await expect(page.getByRole("status")).toContainText("Correct")
    await page.getByRole("button", { name: "Continue" }).click()
  }
  await expect(page.getByText("4 of 4 right on the first try.")).toBeVisible()
  // No conjugation drill follows a por/para lesson.
  await expect(page.getByRole("button", { name: /^Drill/ })).toHaveCount(0)

  await page.getByRole("button", { name: "Back to lessons" }).click()
  await expect(page.getByRole("link", { name: /Por or para/ })).toContainText("Done")
  await expect(page.getByRole("link", { name: /Ser or estar/ })).toContainText("Start")
})

test("Learn is in the sidebar", async ({ page }) => {
  await setupMocks(page)
  await page.goto("/discover")
  await page.getByRole("link", { name: "Learn" }).click()
  await expect(page).toHaveURL(/\/learn$/)
  await expect(page.getByRole("region", { name: "Warm-up question" })).toBeVisible()
})

test("non-Spanish learners see a notice instead of Spanish drills", async ({ page }) => {
  await setupMocks(page, { languagePrefs: { learning: "french", native: "english" } })
  await page.goto("/learn")
  await expect(page.getByText("Learn is Spanish-only for now.")).toBeVisible()
  await expect(page.getByRole("region", { name: "Warm-up question" })).toHaveCount(0)
})
