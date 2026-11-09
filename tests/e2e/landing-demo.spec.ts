/**
 * First-visit landing demo (src/components/landing/landing-demo.tsx): a stored passage a new
 * visitor can hover or tap before doing anything else, with a level and language switch, a
 * "Read a full short story" button that opens a guest-readable book at the chosen level, and a
 * one-line composer that opens up when clicked into. Returning readers (anything read before)
 * get their workspace instead -- no demo.
 */

import { test, expect } from "@playwright/test"
import { setupMocks, SAMPLE_DISCOVER_ITEMS, DEFAULT_MOCK_USER } from "../e2e-mocks/supabase-mock"
import { READING_PROGRESS_STORAGE_KEY } from "../../src/lib/storage/reading-progress-storage"

test.setTimeout(45_000)

const GUEST_STORIES = [
  { ...SAMPLE_DISCOVER_ITEMS[0], id: "story-beginner", title: "Historia Fácil", difficulty: "beginner", open_to_guests: true },
  { ...SAMPLE_DISCOVER_ITEMS[0], id: "story-intermediate", title: "La tortilla de la abuela", difficulty: "intermediate", open_to_guests: true },
]

const details = (page: import("@playwright/test").Page) => page.locator(".landing-demo__details")

test("a first-time visitor can explore the demo without clicking anything first", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [...SAMPLE_DISCOVER_ITEMS, ...GUEST_STORIES] })
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  // One phrase starts explained.
  await expect(details(page)).toContainText("that she didn't care")

  await page.getByRole("button", { name: "puso el grito en el cielo" }).hover()
  await expect(details(page)).toContainText("she hit the roof")
  await expect(details(page)).toContainText("she put the scream in the sky")

  await page.getByRole("group", { name: "Level" }).getByRole("button", { name: "Beginner" }).click()
  await expect(details(page)).toContainText("I have a coffee")
})

test("\"Read a full short story\" opens a guest-readable book at the chosen level", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [...SAMPLE_DISCOVER_ITEMS, ...GUEST_STORIES] })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })

  await page.getByRole("group", { name: "Level" }).getByRole("button", { name: "Beginner" }).click()
  await page.getByRole("button", { name: "Read a full short story" }).click()
  await expect(page.getByText("Historia Fácil").first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toHaveCount(0)
})

test("no guest-readable story: the story button is hidden", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("button", { name: "Read a full short story" })).toHaveCount(0)
})

test("the composer is one line until clicked into", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/")
  const wrapper = page.locator(".textarea-wrapper")
  await expect(wrapper).toHaveClass(/textarea-wrapper--slim/, { timeout: 20_000 })
  const slimHeight = (await wrapper.boundingBox())!.height
  expect(slimHeight).toBeLessThan(80)

  await page.locator(".textarea-field").click()
  await expect(wrapper).not.toHaveClass(/textarea-wrapper--slim/)
  expect((await wrapper.boundingBox())!.height).toBeGreaterThan(slimHeight + 60)

  await page.locator(".textarea-field").fill("Hola, ¿qué tal?")
  await page.locator("body").click({ position: { x: 5, y: 5 } })
  // Has text: stays open.
  await expect(wrapper).not.toHaveClass(/textarea-wrapper--slim/)
})

test("a returning reader gets their workspace, not the demo", async ({ page }) => {
  await page.addInitScript(
    ({ key, userId }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ [userId]: { "mock-item-1": { pageIndex: 1, totalPages: 4, updatedAt: Date.now() } } }),
      )
    },
    { key: READING_PROGRESS_STORAGE_KEY, userId: DEFAULT_MOCK_USER.id },
  )
  await setupMocks(page, { restTables: { reading_progress: [] } })
  await page.goto("/")
  await expect(page.getByText("Continue reading")).toBeVisible({ timeout: 20_000 })
  await expect(page.locator(".landing-demo")).toHaveCount(0)
  await expect(page.locator(".textarea-wrapper")).toHaveClass(/textarea-wrapper--slim/)
})
