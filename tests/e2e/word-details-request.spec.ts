/**
 * The word-details sheet sends only the sentence around the tapped word (not the whole page,
 * which burned the details model's per-minute token limit), and a failed lookup says why
 * instead of always blaming the connection.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test.use({
  mockOptions: {
    groqChatContent: JSON.stringify([
      { c: "El zorro corría.", m: "The fox was running." },
      { c: "Luego", m: "Then" },
      { c: "se detuvo.", m: "it stopped." },
    ]),
  },
})

test("details lookups send just the sentence, and a rate limit is named as such", async ({ page }) => {
  const bodies: Array<{ chunk?: string; sentence?: string }> = []
  await page.route("**/functions/v1/chunk-details**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200 })
    bodies.push(route.request().postDataJSON())
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Groq error: 429" }),
    })
  })

  await page.goto("/")
  await page.locator("textarea").fill("El zorro corría. Luego se detuvo.")
  await page.getByRole("button", { name: "Start reading" }).click()

  await page.locator("[data-chunk]").nth(2).click()
  await expect(page.getByText(/Too many lookups right now/)).toBeVisible({ timeout: 20_000 })
  expect(bodies.at(-1)).toMatchObject({ chunk: "se detuvo.", sentence: "Luego se detuvo." })
})
