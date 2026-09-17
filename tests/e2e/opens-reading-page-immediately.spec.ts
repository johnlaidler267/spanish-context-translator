/**
 * Verifies the reading page opens as soon as pages are built, not once the LLM translation call
 * finishes -- the previous flow waited out a fixed-duration loading-overlay animation (and,
 * before that, the real translation) before navigating, which is exactly the "stalls at 100%"
 * complaint. Now the app should flip straight into article mode and show its own per-page
 * "Translating this page…" indicator while the (here, artificially delayed) groq-chat call is
 * still in flight.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test("navigates into the reading page immediately and shows the per-page translating state while the LLM call is still in flight", async ({
  page,
}) => {
  // Registered after the fixture's own groq-chat mock, so it takes priority: delay the response
  // well past the loading overlay's own fill duration (1.75s).
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

  // Reaches article mode with its own translating indicator well before the 4s delayed LLM
  // response -- the old flow would still be sitting on the loading overlay at this point.
  await expect(page.getByText("Translating this page…")).toBeVisible({ timeout: 1000 })

  // Once the delayed response actually resolves, the real translated chunk replaces it.
  await expect(page.getByText("Hola")).toBeVisible({ timeout: 5000 })
})
