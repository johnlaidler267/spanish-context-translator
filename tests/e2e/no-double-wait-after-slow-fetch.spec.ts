/**
 * Regression test for the actual "stalls at 100% for a bit" root cause: handleDiscoverStartReading
 * flips the loading overlay on (and its bar starts filling) *before* the body_text network fetch,
 * but the post-setup cosmetic wait in handleTextSubmit used to be anchored to its own start time --
 * i.e. *after* that fetch already resolved -- instead of to when the overlay first appeared. So a
 * slow fetch (alone already past the bar's fill duration) got a full extra ~1.75s tacked on before
 * navigating, on top of however long the fetch itself took. Confirms the app instead cuts over to
 * the reading page shortly after the (artificially slow) fetch resolves, not ~1.75s later still.
 */

import { test, expect } from "../e2e-mocks/fixtures"

// Starting to read a Discover item pulls cross-device reading_progress (see
// ensureCloudReadingProgressPulled) -- mock it directly rather than letting that request hit the
// real network, which the sandbox's proxy can take a long time to fail.
test.use({ mockOptions: { restTables: { reading_progress: [] } } })

test("does not add a second full bar-fill wait after an already-slow fetch", async ({ page }) => {
  const FETCH_DELAY_MS = 3000

  await page.route("**/rest/v1/discover_items**id=eq.mock-item-1**", async (route) => {
    await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([{ body_text: "Había una vez..." }]),
    })
  })

  await page.goto("/discover")
  await page.getByText("El Principito").first().click()

  const clickedAt = Date.now()
  await page.getByRole("button", { name: "Start reading" }).click()

  // Should land in the reading page shortly after the fetch resolves (~3s), not ~4.75s+ later
  // (3s fetch + another full 1.75s bar-fill wait, the bug this covers). Checked via the reading
  // surface itself, not the "Translating this page…" text -- with the default (undelayed)
  // groq-chat mock the translation can resolve fast enough that text never gets caught mid-poll.
  // The upper bound leaves generous room for the dev server's own first-load module-transform
  // overhead (the reading surface chunk is lazy-loaded, see reading-surface-lazy.tsx) -- it's set
  // well below where the bug would land (fetch + a second full bar-fill wait, ~5.1s+).
  await expect(page.getByTestId("reading-surface")).toBeVisible({ timeout: 8000 })
  const elapsedMs = Date.now() - clickedAt

  expect(elapsedMs).toBeGreaterThan(FETCH_DELAY_MS - 300)
  expect(elapsedMs).toBeLessThan(FETCH_DELAY_MS + 1600)
})
