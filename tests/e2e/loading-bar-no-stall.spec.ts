/**
 * Repro/verification for "the loading bar stalls at 92%": the overlay used to cap its progress
 * bar flat at PRE_READY_MAX_WIDTH (92%) whenever the real setup work behind it outlasted the
 * bar's own ~1s fill animation -- which, combined with the immediate-loading-state fix for the
 * "tap does nothing" bug, is now common on a slow connection (the body_text fetch that fires on
 * tap, before the overlay's own clock even starts counting toward "ready"). Delays that fetch
 * well past 1s and samples the displayed percentage over that window to confirm it keeps
 * climbing instead of freezing.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test("progress bar keeps advancing instead of freezing while real setup work is still in flight", async ({
  page,
}) => {
  // Same single-row body_text lookup delayed in the tap-feedback repro, but held open for much
  // longer here -- long enough to sample the bar well past the old 1s/92% stall point.
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

  // Sample well past the old 1s fill clock (and past the old 92% cap) while the delayed fetch is
  // still in flight -- each later sample must be strictly higher than the last, and still stay
  // below 100 since the real work isn't done yet. A flat/repeated value here is exactly the old
  // stall bug.
  await page.waitForTimeout(1500)
  const p1 = await readPercent()
  await page.waitForTimeout(1500)
  const p2 = await readPercent()
  await page.waitForTimeout(1500)
  const p3 = await readPercent()

  expect(p2).toBeGreaterThan(p1)
  expect(p3).toBeGreaterThan(p2)
  expect(p3).toBeLessThan(100)
})
