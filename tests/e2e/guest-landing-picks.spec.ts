/**
 * Signed-out landing page: a first-time visitor should get something to click under the
 * composer -- Discover picks with short pieces (which open without an account) ahead of books,
 * on mobile too -- plus a one-line explainer. With no catalog, the built-in sample shows instead
 * of a bare sign-in ask.
 */

import { test, expect } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

test.setTimeout(45_000)

test("desktop: short pieces come before books, with an explainer line", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/")
  await expect(page.getByText("tap a phrase to see what it means")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("Try a short read")).toBeVisible()
  const titles = page.locator(".continue-reading__row").getByText(/Despacito|El Principito/)
  await expect(titles).toHaveText(["Despacito", "El Principito"])
  await expect(page.getByText("Welcome", { exact: true })).toHaveCount(0)
})

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("shows the picks row above the composer", async ({ page }) => {
    await setupMocks(page, { signedIn: false })
    await page.goto("/")
    const row = page.locator(".continue-reading-mobile__row")
    await expect(row.getByText("Despacito")).toBeVisible({ timeout: 20_000 })
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
