/**
 * Verification for the loading bar's fixed-duration, constant-rate fill: it must climb smoothly
 * from 0% to 100% on its own clock, with no dependence on (and no stall waiting for) the real
 * work behind it. Delays the body_text fetch that fires on tap well past the bar's own fill
 * duration and confirms the bar still reaches 100% on schedule instead of freezing partway
 * while the real work is still in flight.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test("progress bar fills to 100% on its own schedule, independent of the still-in-flight fetch", async ({
  page,
}) => {
  // Held open far longer than the bar's own fill duration (1.75s) -- the bar must still complete
  // its fill without waiting on this.
  await page.route("**/rest/v1/discover_items**id=eq.mock-item-1**", async (route) => {
    await new Promise((r) => setTimeout(r, 6000))
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([{ body_text: "Había una vez..." }]),
    })
  })

  await page.goto("/discover")
  await page.getByText("El Principito").first().click()
  await page.getByRole("button", { name: "Start reading" }).click()

  const progressbar = page.getByRole("progressbar", { name: "Translation progress" })
  await expect(progressbar).toBeVisible({ timeout: 1000 })

  const readPercent = async () => {
    const text = (await progressbar.textContent()) ?? "0%"
    return Number.parseInt(text, 10)
  }

  // Samples during the fill must be strictly increasing -- a repeated/flat value here would be
  // the old stall bug.
  await page.waitForTimeout(400)
  const p1 = await readPercent()
  await page.waitForTimeout(400)
  const p2 = await readPercent()
  expect(p2).toBeGreaterThan(p1)
  expect(p1).toBeGreaterThan(0)

  // The fetch behind this is still 5+ seconds from resolving, but the bar's own fill duration
  // (1.75s) has now elapsed -- it must be at 100% regardless, not waiting on the real work.
  await page.waitForTimeout(1100)
  expect(await readPercent()).toBe(100)
})
