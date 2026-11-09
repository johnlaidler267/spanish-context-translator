/**
 * Signed-out landing page: a first-time visitor sees the demo up top, and on desktop something
 * to click under the composer -- Discover picks with short pieces (which open without an
 * account) ahead of books. On a phone the demo takes the picks row's place (no room for both).
 * With no catalog, the built-in sample shows instead of a bare sign-in ask.
 */

import { test, expect } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

test.setTimeout(45_000)

test("desktop: short pieces come before books, with an explainer line", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("Try a short read")).toBeVisible()
  const titles = page.locator(".continue-reading__row .discover-card__title")
  await expect(titles).toHaveText(["Despacito", "El Principito"])
  await expect(page.getByText("Welcome", { exact: true })).toHaveCount(0)
})

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("shows the demo instead of the picks row, worded for touch", async ({ page }) => {
    await setupMocks(page, { signedIn: false })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(".landing-demo__hint").getByText("Tap any phrase")).toBeVisible()
    await expect(page.locator(".landing-demo__hint").getByText("Hover any phrase")).toBeHidden()
    await expect(page.locator(".continue-reading-mobile__row")).toHaveCount(0)
  })
})

test("no catalog: falls back to the built-in sample, not a sign-in ask", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [] })
  await page.goto("/")
  await expect(page.getByText("Try this sample")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("Welcome", { exact: true })).toHaveCount(0)
})

test("slow catalog: the sample doesn't flash in before the picks arrive", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.route("**/rest/v1/discover_items*", async (route) => {
    await new Promise((r) => setTimeout(r, 2500))
    await route.fallback()
  })
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(800)
  await expect(page.getByText("Try this sample")).toHaveCount(0)
  await expect(page.getByText("Try a short read")).toBeVisible({ timeout: 20_000 })
})
