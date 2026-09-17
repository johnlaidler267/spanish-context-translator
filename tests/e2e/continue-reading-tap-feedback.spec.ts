/**
 * Repro for "I tap a content card and nothing happens for ~4 seconds": handleDiscoverStartReading
 * (src/App.tsx) used to await the discover_items body_text fetch *before* setting any loading
 * state, so a slow network round trip on that single fetch was a dead zone with zero visual
 * feedback. Delays that fetch here and asserts the loading overlay now shows immediately on tap,
 * instead of only once the (still in-flight) fetch resolves.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test("loading overlay appears immediately on tap, before the body-text fetch resolves", async ({ page }) => {
  // Delay only the per-item body_text lookup (`id=eq.<id>`) that handleDiscoverStartReading
  // fires on tap -- the initial catalog list fetch (no id filter) stays fast so the page loads
  // normally. Registered after the fixture's setupMocks route, so it takes priority for matches.
  await page.route("**/rest/v1/discover_items**id=eq.mock-item-1**", async (route) => {
    await new Promise((r) => setTimeout(r, 4000))
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([{ body_text: "Había una vez..." }]),
    })
  })

  await page.goto("/discover")
  await page.getByText("El Principito").first().click()

  const startReadingButton = page.getByRole("button", { name: "Start reading" })
  await expect(startReadingButton).toBeVisible()
  await startReadingButton.click()

  // Must show up well before the 4s delayed fetch resolves -- this is the actual regression
  // check. A generous 1s timeout still fails on the old behavior (overlay only appeared once
  // handleTextSubmit ran, after the fetch).
  await expect(page.getByRole("progressbar", { name: "Translation progress" })).toBeVisible({
    timeout: 1000,
  })
})
