/**
 * One-time "how to look up a phrase" tip for a brand-new reader (first-read-tip.tsx): shown on
 * the first reading screen, gone for good after the first press on a phrase.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test.use({ mockOptions: { showFirstReadTip: true } })

test.setTimeout(45_000)

test("first reading screen shows the tip until a phrase is pressed, then never again", async ({ page }) => {
  await page.goto("/")
  await page.locator("textarea").fill("Hola. Adiós.")
  await page.getByRole("button", { name: "Start reading" }).click()

  const tip = page.getByTestId("first-read-tip")
  await expect(tip).toContainText("Hover any phrase")

  await page.locator("[data-chunk-id]").first().click()
  await expect(tip).toHaveCount(0)

  await page.reload()
  await page.locator("textarea").fill("Hola. Adiós.")
  await page.getByRole("button", { name: "Start reading" }).click()
  await expect(page.locator("[data-chunk-id]").first()).toBeVisible()
  await expect(tip).toHaveCount(0)
})
