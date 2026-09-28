/**
 * First visit asks which language the reader is learning (Discover, read-aloud and word
 * explanations all follow it), remembers the answer, and saves it to a signed-in account so it
 * follows them to other devices. A signed-in reader whose account already has a choice is never
 * asked, and gets that choice on this device.
 */

import { test, expect } from "@playwright/test"
import { setupMocks, SAMPLE_DISCOVER_ITEMS } from "../e2e-mocks/supabase-mock"

const PREFS_KEY = "lector-language-learning-preferences"
const FRENCH_ITEM = { ...SAMPLE_DISCOVER_ITEMS[0], id: "mock-fr-1", title: "Le Petit Prince", language: "French" }

test("a first-time visitor picks French once and gets the French Discover", async ({ page }) => {
  await setupMocks(page, { languagePrefs: null, discoverItems: [...SAMPLE_DISCOVER_ITEMS, FRENCH_ITEM] })
  const accountSaves: unknown[] = []
  page.on("request", (req) => {
    if (req.url().includes("/auth/v1/user") && req.method() === "PUT") accountSaves.push(req.postDataJSON())
  })

  await page.goto("/")
  const picker = page.getByRole("dialog", { name: "What are you learning?" })
  await expect(picker).toBeVisible({ timeout: 20_000 })
  await picker.getByRole("button", { name: /French/ }).click()
  await expect(picker).toHaveCount(0)
  await expect(page.getByText("Bonjour")).toBeVisible()

  // Saved to the (signed-in) account, not just this browser.
  await expect
    .poll(() => accountSaves)
    .toContainEqual(expect.objectContaining({ data: { learning_language: "french", native_language: "english" } }))

  // Remembered: not asked again, and Discover is the French one.
  await page.reload()
  await expect(page.getByText("Bonjour")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("dialog", { name: "What are you learning?" })).toHaveCount(0)
  await page.goto("/discover")
  await expect(page.getByText("Le Petit Prince").first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("El Principito")).toHaveCount(0)
})

test("\"Not now\" keeps Spanish and doesn't ask again", async ({ page }) => {
  await setupMocks(page, { languagePrefs: null })
  await page.goto("/")
  const picker = page.getByRole("dialog", { name: "What are you learning?" })
  await expect(picker).toBeVisible({ timeout: 20_000 })
  await picker.getByRole("button", { name: "Not now" }).click()
  await expect(page.getByText("Hola")).toBeVisible()
  await page.reload()
  await expect(page.getByText("Hola")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("dialog", { name: "What are you learning?" })).toHaveCount(0)
})

test("a signed-in reader's saved account language applies on a new device, with no prompt", async ({ page }) => {
  await setupMocks(page, {
    languagePrefs: null,
    user: { user_metadata: { learning_language: "french", native_language: "english" } },
  })
  await page.goto("/")
  await expect(page.getByText("Bonjour")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("dialog", { name: "What are you learning?" })).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), PREFS_KEY)).toContain("french")
})

test("a choice made before signing in is copied up to an account that has none", async ({ page }) => {
  await setupMocks(page, {
    languagePrefs: { learning: "french", native: "english" },
    user: { user_metadata: {} },
  })
  const accountSaves: unknown[] = []
  page.on("request", (req) => {
    if (req.url().includes("/auth/v1/user") && req.method() === "PUT") accountSaves.push(req.postDataJSON())
  })
  await page.goto("/")
  await expect(page.getByText("Bonjour")).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() => accountSaves)
    .toEqual([expect.objectContaining({ data: { learning_language: "french", native_language: "english" } })])
})
