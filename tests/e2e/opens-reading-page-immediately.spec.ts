/**
 * Verifies the loading-overlay-then-reading-page handoff: the overlay's cosmetic bar plays out
 * to its own fixed duration (LOADING_OVERLAY_PROGRESS_MS), and the app cuts over to the reading
 * page the moment that finishes -- not before (the bar isn't skipped), and not noticeably after
 * either (no sitting at a stale 100% waiting on the real LLM call, which is still in flight at
 * that point and finishes in the background, covered by ArticleContent's own per-page
 * "Translating this page…" state).
 */

import { test, expect } from "../e2e-mocks/fixtures"

test("cuts over to the reading page right when the loading bar finishes, with the LLM call still in flight", async ({
  page,
}) => {
  // Registered after the fixture's own groq-chat mock, so it takes priority: delay the response
  // well past the loading overlay's own fill duration (1.75s), so the reading page's own
  // translating state is what's covering the remaining wait, not the overlay.
  await page.route("**/functions/v1/groq-chat**", async (route) => {
    await new Promise((r) => setTimeout(r, 4000))
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "mock-chatcmpl-delayed",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "openai/gpt-oss-120b",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify([{ c: "Hola", m: "Hello" }]),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    })
  })

  await page.goto("/")
  await page.locator("textarea").fill("Hola mundo, esto es una prueba.")
  await page.getByRole("button", { name: "Start reading" }).click()

  const progressbar = page.getByRole("progressbar", { name: "Translation progress" })
  await expect(progressbar).toBeVisible({ timeout: 1000 })

  // The bar must not be skipped -- still up partway through its own fill duration.
  await page.waitForTimeout(800)
  await expect(progressbar).toBeVisible()

  // Once the bar's own ~1.75s duration has elapsed, the app should have cut over to the reading
  // page already -- well before the still-in-flight 4s LLM response -- showing its own
  // translating indicator instead of the overlay sitting at a stale 100%.
  await expect(page.getByText("Translating this page…")).toBeVisible({ timeout: 1500 })
  await expect(progressbar).not.toBeVisible()

  // Once the delayed response actually resolves, the real translated chunk replaces it.
  await expect(page.getByText("Hola")).toBeVisible({ timeout: 5000 })
})
