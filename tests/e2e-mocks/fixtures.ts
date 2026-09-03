/**
 * Playwright fixture wrapper around `setupMocks` (see supabase-mock.ts) — the
 * ergonomic entry point most tests should import instead of calling `setupMocks`
 * by hand. Mocks are applied automatically before every test in a file that
 * imports `test` from here, so a test file can be almost entirely about the flow
 * being tested.
 *
 * Usage:
 *   import { test, expect } from "../e2e-mocks/fixtures"
 *
 *   test("discover page renders content cards", async ({ page }) => {
 *     await page.goto("/discover")
 *     await expect(page.getByText("El Principito")).toBeVisible()
 *   })
 *
 * To customize what's mocked for a whole file (e.g. a specific subscription tier,
 * or a signed-out guest run), set the `mockOptions` fixture — either per test:
 *
 *   test("shows the upgrade prompt", async ({ page }) => {
 *     test.info().annotations // (just an example anchor — see test.use below)
 *   })
 *
 *   test.use({ mockOptions: { subscription: { status: "active", plan_id: "pro" } } })
 *
 * or inside a `test.describe` block to scope it to a group of tests. See
 * SetupMocksOptions in supabase-mock.ts for everything that can be overridden.
 */

import { test as base, expect } from "@playwright/test"
import { setupMocks, type SetupMocksOptions, type MockUser } from "./supabase-mock"

interface LexaLensFixtures {
  /** Options passed to `setupMocks`. Override with `test.use({ mockOptions: {...} })`. */
  mockOptions: SetupMocksOptions
  /** The mock signed-in user (or null when `mockOptions.signedIn` is false). Applies mocks as a side effect — depend on `page` alone if you don't need the user object itself. */
  mockUser: MockUser | null
}

export const test = base.extend<LexaLensFixtures>({
  mockOptions: [{}, { option: true }],
  // `auto: true` — runs (and so applies the mocks) for every test, even one that
  // never references `mockUser` directly.
  mockUser: [
    async ({ page, mockOptions }, use) => {
      const { user } = await setupMocks(page, mockOptions)
      await use(user)
    },
    { auto: true },
  ],
})

export { expect }
export { setupMocks } from "./supabase-mock"
export type { SetupMocksOptions, MockUser } from "./supabase-mock"
