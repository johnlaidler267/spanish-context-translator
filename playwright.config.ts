import { existsSync } from "fs"
import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for LexaLens's mocked-backend E2E harness (see
 * tests/e2e-mocks/README.md). Boots the Vite dev server itself with dummy Supabase
 * env vars (same dummies vite.config.js's vitest `test.env` block uses) — nothing
 * hits a real Supabase project or Groq key; tests/e2e-mocks intercepts every
 * backend call instead. Run with `npm run test:e2e`.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4317)

// Only set when this sandbox's pre-fetched Chromium is actually present — leaves
// `executablePath` unset (Playwright's normal browser resolution) on any other
// machine, e.g. a contributor's laptop or a future CI job with its own browser cache.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium"
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined)

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `./scripts/run-with-nvm.sh vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Dummy, unreachable-by-design — tests/e2e-mocks intercepts every request
      // the app would otherwise send here. Must stay in sync with
      // tests/e2e-mocks/supabase-mock.ts's MOCK_SUPABASE_URL / MOCK_SUPABASE_ANON_KEY.
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      VITE_STRIPE_PRICE_PRO_MONTHLY: "price_test_monthly",
      VITE_STRIPE_PRICE_PRO_ANNUAL: "price_test_annual",
    },
  },
})
