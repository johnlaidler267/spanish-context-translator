# E2E mocking harness

Reusable Playwright setup for browser-level bug repro against this repo, with **no
real Supabase project or Groq key required**. It fakes a signed-in Supabase session
and mocks the backend calls a normal signed-in flow makes (Supabase Auth, the
`discover_items` / `user_subscriptions` tables, and the `groq-chat` /
`chunk-details` / `track-usage` Edge Functions).

**Prefer this harness for any browser-level repro instead of hand-rolling mocks.**
Spinning up a server and faking auth/network from scratch is the single most
expensive, most repeated setup step across agent sessions on this repo — that cost
is exactly what this exists to remove.

**Prefer a plain component/unit test over this when you can.** If the bug is about
component logic or state — not something you need an actual browser and real
cross-page navigation to see — write a Vitest + React Testing Library test instead
(see the existing `*.test.ts(x)` files next to the code they cover, e.g.
`src/contexts/auth-context.test.ts`). It's cheaper and faster, and this repo already
has that pattern set up (`npm run test`). Reach for Playwright + this harness when
the bug is genuinely about what renders on a real page, navigation between routes,
or something that only shows up in an actual browser.

## Quick start

```ts
// tests/e2e/my-bug.spec.ts
import { test, expect } from "../e2e-mocks/fixtures"

test("describes the bug you're reproducing", async ({ page }) => {
  await page.goto("/") // mocks are already wired up by the time this runs
  await expect(page.getByText("something")).toBeVisible()
})
```

Run it:

```sh
npm run test:e2e
```

That's it for the common case — `test`/`expect` imported from `../e2e-mocks/fixtures`
(not `@playwright/test` directly) apply the default mock set automatically before
each test: a signed-in user, an empty/free `user_subscriptions` row, two sample
`discover_items` rows, and stub responses for `groq-chat` / `chunk-details` /
`track-usage`. `playwright.config.ts` boots the Vite dev server itself with dummy
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — you don't need to create a `.env.local`
or start anything yourself.

## Customizing what's mocked

Override defaults per test file with `test.use(...)`, or per test by calling
`setupMocks` yourself instead of using the fixture:

```ts
import { test, expect } from "../e2e-mocks/fixtures"

// Whole file: a Pro-tier subscriber instead of the default free/no-row user.
test.use({
  mockOptions: {
    subscription: { status: "active", plan_id: "pro", past_due_since: null },
  },
})

test("pro users see the pro badge", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Pro")).toBeVisible()
})
```

```ts
import { test, expect } from "@playwright/test"
import { setupMocks } from "../e2e-mocks/supabase-mock"

test("signed-out / guest experience", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})
```

See `SetupMocksOptions` in `supabase-mock.ts` for the full list: `signedIn`, `user`,
`discoverItems`, `subscription`, `restTables` (any other `supabase.from(table)` your
flow needs), `groqChatContent`, `chunkDetails`, `trackUsage`.

For a translate/read flow, `groqChatContent` needs to be a JSON array string
matching the LLM's actual chunk contract (`{"c": "...", "m": "...", "l"?: "...",
"n"?: "..."}` — chunk / meaning / literal / note; see
`src/lib/translate/chunk-reconcile.ts`), not the default placeholder.

For anything not covered by `SetupMocksOptions` — a different Edge Function, a
different table, a non-default HTTP status — call `mockEdgeFunction` / `mockRestTable`
/ `page.route(...)` directly after `setupMocks` (or instead of it).

## How the fake sign-in works

`supabase-js` restores a session from `localStorage` on page load without a network
call, under a key derived from the Supabase URL (`sb-<hostname-first-label>-auth-token`).
`mockSignedInSession` seeds that key via `page.addInitScript` before any app code
runs, so `useAuth()` resolves as signed-in immediately. `mockAuthRoutes` additionally
intercepts `/auth/v1/user` (which, unlike `getSession()`, always makes a real network
call to validate the token — `checkSubscriptionStatus()` calls it on every load) and
`/auth/v1/token` (refresh), so nothing here depends on reaching a real Supabase
project.

## Files

- `supabase-mock.ts` — the actual mocks: `setupMocks`, plus the individual pieces
  (`mockSignedInSession`, `mockAuthRoutes`, `mockRestTable`, `mockEdgeFunction`) for
  building something more custom.
- `fixtures.ts` — the `test`/`expect` you import in a spec file; wraps `setupMocks`
  as an auto-applied Playwright fixture.
- `../e2e/discover-smoke.spec.ts` — the one proof-of-life test. Keep this suite
  small; it exists to prove the harness works, not to be a growing E2E suite. Add
  a spec here only for the specific bug/flow you're actually reproducing, and
  prefer deleting a scratch spec once you're done unless the user asked you to keep it.

## Config notes

- `playwright.config.ts` (repo root) starts `vite` itself as the `webServer`, with
  `VITE_SUPABASE_URL=https://example.supabase.co` / `VITE_SUPABASE_ANON_KEY=test-anon-key`
  — the same dummies `vite.config.js`'s `test.env` block gives Vitest. Keep these in
  sync with `MOCK_SUPABASE_URL`/`MOCK_SUPABASE_ANON_KEY` at the top of
  `supabase-mock.ts` if you ever change either.
- Chromium: this sandbox has a pre-fetched browser at `/opt/pw-browsers/chromium`
  (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). The config points `executablePath`
  at it only when that path exists on disk, so this also works unmodified on a
  machine with a normal `npx playwright install` browser cache.
- `npm run test:e2e` is separate from `npm run test` (Vitest) on purpose — it's not
  part of the routine lint/typecheck/test/build loop in the top-level CLAUDE.md,
  since it's slower and only needed for an actual browser repro. Run it explicitly
  when that's what you're doing.
