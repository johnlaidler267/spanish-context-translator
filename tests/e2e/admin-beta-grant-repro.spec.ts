import { test, expect } from "../e2e-mocks/fixtures"
import { DEFAULT_MOCK_USER } from "../e2e-mocks/supabase-mock"

test.use({
  mockOptions: {
    restTables: {
      discover_curators: [{ user_id: DEFAULT_MOCK_USER.id }],
      beta_pro_grants: [],
    },
  },
})

test("curator sees the beta grant form and can submit a grant", async ({ page }) => {
  let grantRequestBody: unknown = null
  await page.route(`https://example.supabase.co/functions/v1/admin-beta-grant**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } })
    }
    grantRequestBody = route.request().postDataJSON()
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, alreadyActivated: false }),
    })
  })

  await page.goto("/admin")

  await expect(page.getByRole("heading", { name: "Beta Pro access" })).toBeVisible()
  await expect(page.getByText("No grants yet.")).toBeVisible()

  await page.getByLabel("Email").fill("friend@example.com")
  await page.getByLabel("Note (optional)").fill("college roommate")
  await page.getByRole("button", { name: "Grant Pro" }).click()

  await expect(page.getByLabel("Email")).toHaveValue("", { timeout: 5000 })
  expect(grantRequestBody).toEqual({
    action: "grant",
    email: "friend@example.com",
    note: "college roommate",
  })
})

// A non-curator/production denial case isn't covered here: this harness runs against
// the Vite dev server, where AdminPage (like the Discover admin UI it mirrors) always
// shows the controls in dev mode -- RLS on beta_pro_grants is what actually enforces
// this in production. See DISCOVER_DEV_EDIT's docstring on the Discover page.
