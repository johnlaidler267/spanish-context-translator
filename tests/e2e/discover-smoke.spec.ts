/**
 * Smoke test for tests/e2e-mocks — proves the harness actually works end to end:
 * a signed-in session (faked, no real Supabase project) loads the Discover page,
 * which fetches its catalog via `supabase.from("discover_items")` and renders it,
 * without ever touching a real backend.
 *
 * This is deliberately the only spec here — see tests/e2e-mocks/README.md for when
 * to add more vs. reaching for a plain Vitest/RTL component test instead.
 */

import { test, expect } from "../e2e-mocks/fixtures"

test("Discover page renders mocked content cards for a signed-in user", async ({ page, mockUser }) => {
  expect(mockUser).not.toBeNull()

  await page.goto("/discover")

  // The two SAMPLE_DISCOVER_ITEMS rows from the mocked `discover_items` table.
  // `.first()`: the layout renders separate desktop/mobile card trees, so each
  // title legitimately matches twice.
  await expect(page.getByText("El Principito").first()).toBeVisible()
  await expect(page.getByText("Despacito").first()).toBeVisible()

  // Confirms the fake session actually took effect (not just that the page loaded):
  // main-header renders a "Sign in" control only for a signed-out/guest user.
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0)
})
