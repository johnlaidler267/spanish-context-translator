/**
 * Reading-mode toolbar (back arrow + mode/theme/settings rail, see reading-header.tsx)
 * auto-hides after a short idle period and reappears on a tap on the reading surface —
 * but a tap on a word or a page-turn arrow must keep its own existing behavior instead
 * of being swallowed by the new "reveal toolbar" gesture (see App.tsx's
 * handleReadingSurfaceTap / TOOLBAR_IDLE_HIDE_MS).
 */

import { test, expect } from "../e2e-mocks/fixtures"

// Two short sentences (LLM chunks end in "." so read-mode splits them into two steps —
// see splitIntoSentences in chunk-reconcile.ts) so the "Next sentence" arrow is enabled.
test.use({
  mockOptions: {
    groqChatContent: JSON.stringify([
      { c: "Hola.", m: "Hello." },
      { c: "Adiós.", m: "Goodbye." },
    ]),
  },
})

test.setTimeout(45_000)

test("reading toolbar fades on idle, reappears on tap, and word/arrow taps keep their own behavior", async ({
  page,
}) => {
  await page.goto("/")

  await page.locator("textarea").fill("Hola. Adiós.")
  await page.getByRole("button", { name: "Start reading" }).click()

  const header = page.locator("header.reading-toolbar")
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible()
  await expect(header).toHaveCSS("opacity", "1")

  // Switch to Read mode so a real, always-rendered "Next sentence" arrow is available
  // (article mode's page-turn footer only renders once content spans >1 LLM page).
  await page.getByRole("button", { name: "Read", exact: true }).click()
  await expect(page.getByRole("button", { name: "Next sentence" })).toBeEnabled()

  // Idle-hides with no interaction.
  await expect(header).toHaveCSS("opacity", "0", { timeout: 10_000 })

  // Tap elsewhere on the reading surface (not a word, not an arrow) brings it back.
  // Top-left corner of the surface is blank padding, clear of the centered sentence text.
  await page.getByTestId("reading-surface").click({ position: { x: 20, y: 20 } })
  await expect(header).toHaveCSS("opacity", "1")

  // Let it idle-hide again before probing the excluded taps.
  await expect(header).toHaveCSS("opacity", "0", { timeout: 10_000 })

  // A tap on a word must not reveal the toolbar, and must still open its own details box
  // (a desktop click on a chunk opens the grammar/meaning sheet — see text-chunk.tsx).
  await page.locator("[data-chunk]").first().click()
  await expect(
    page.getByText("Mocked grammar explanation from the e2e test harness."),
  ).toBeVisible()
  await expect(header).toHaveCSS("opacity", "0")
  await page.getByRole("button", { name: "Close details" }).click()

  // A tap on the page-turn arrow must not reveal the toolbar either, and must still
  // advance to the next sentence.
  await page.getByRole("button", { name: "Next sentence" }).click()
  await expect(page.getByText("Adiós.")).toBeVisible()
  await expect(header).toHaveCSS("opacity", "0")
})
