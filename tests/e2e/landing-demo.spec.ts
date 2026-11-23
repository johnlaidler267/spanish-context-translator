/**
 * First-visit landing demo (src/components/landing/landing-demo.tsx): a stored passage a new
 * visitor can hover or tap before doing anything else, with a level and language switch (the
 * level also orders the short reads under it), and a one-line composer that opens up when
 * clicked into. Returning readers (anything read before)
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

const tooltip = (page: import("@playwright/test").Page, text: string) =>
  page.locator("[data-popup]", { hasText: text })
const phrase = (page: import("@playwright/test").Page, text: string) =>
  page.locator(".landing-demo [data-chunk]").filter({ hasText: new RegExp(`^${text}$`) })

test("a first-time visitor can explore the demo without clicking anything first", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [...SAMPLE_DISCOVER_ITEMS, ...GUEST_STORIES] })
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  // One phrase starts with the reader's tooltip open.
  await expect(tooltip(page, "she hit the roof")).toBeVisible()

  await phrase(page, "le daba igual").hover()
  await expect(tooltip(page, "she didn't care")).toBeVisible()
  await expect(tooltip(page, "she didn't care")).toContainText("to her it gave equal")

  await page.getByRole("group", { name: "Level" }).getByRole("button", { name: "Beginner" }).click()
  await expect(tooltip(page, "in the morning")).toBeVisible()
  // Ordinary words are their own chunks, as in the real reader.
  await phrase(page, "tomo").hover()
  await expect(tooltip(page, "I have")).toBeVisible()
})

test("the short reads under the demo lead with a story at the level just tried", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [...SAMPLE_DISCOVER_ITEMS, ...GUEST_STORIES] })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  const firstTitle = page.locator(".continue-reading__row .discover-card__title").first()
  await expect(firstTitle).toHaveText("La tortilla de la abuela") // demo starts at Intermediate

  await page.getByRole("group", { name: "Level" }).getByRole("button", { name: "Beginner" }).click()
  await expect(firstTitle).toHaveText("Historia Fácil")
  // No divider between the composer and the picks on a first visit: one flow.
  await expect(page.locator(".filigree-divider")).toHaveCount(0)
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

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("short phone: the demo keeps the room, the picks row becomes one line", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await setupMocks(page, { signedIn: false })
    await page.goto("/")
    await expect(page.locator(".landing-demo__nudge")).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(".landing-guest-picks-mobile")).toBeHidden()
    // ...but there's still one tap into a story.
    const line = page.locator(".landing-guest-pick-line")
    await expect(line).toBeVisible()
    await expect(line).toContainText("Try a short read:")
  })

  test("no tooltip opens on its own; the showcase phrase pulses until the first tap", async ({ page }) => {
    await setupMocks(page, { signedIn: false })
    await page.goto("/")
    const nudge = page.locator(".landing-demo__nudge")
    await expect(nudge).toContainText("puso el grito en el cielo", { timeout: 20_000 })
    await page.waitForTimeout(500)
    for (const popup of await page.locator("[data-popup]").all()) await expect(popup).toHaveCSS("opacity", "0")
    await phrase(page, "puso el grito en el cielo").tap()
    await expect(nudge).toHaveCount(0)
  })

  test("touching a phrase shows its tooltip, and lifting the finger hides it", async ({ page }) => {
    await setupMocks(page, { signedIn: false })
    await page.goto("/")
    await expect(page.locator(".landing-demo__nudge")).toBeVisible({ timeout: 20_000 })
    const box = (await phrase(page, "le daba igual").boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: string, points: { x: number; y: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points })

    // Finger down on the phrase: its tooltip shows while it's held.
    await touch("touchStart", [{ x, y }])
    await expect(tooltip(page, "she didn't care")).toBeVisible()
    // Finger lifted: the tooltip goes away (it used to stay stuck open).
    await touch("touchEnd", [])
    // (A closed tooltip fades to opacity 0 before it unmounts.)
    await expect(tooltip(page, "she didn't care")).toHaveCSS("opacity", "0")

    // A plain tap (which also fires the browser's emulated mouse events) doesn't leave one up.
    await phrase(page, "le daba igual").tap()
    await page.waitForTimeout(300)
    for (const popup of await page.locator("[data-popup]").all()) await expect(popup).toHaveCSS("opacity", "0")
  })
})

test.describe("phone workspace", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  // The slim composer frees a lot of height on a phone. It all used to pile up above the
  // illustration, sinking the art, greeting and Continue Reading card toward the composer.
  test("the art, greeting and Continue Reading card stay vertically centered", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: /ready to read/ })).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(600) // let the art finish loading and the card settle

    const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!
    const header = await box("header, [role=banner]")
    const art = await box(".landing-hero-art")
    const divider = await box(".filigree-divider")
    const composer = await box(".textarea-wrapper")
    const above = art.y - (header.y + header.height)
    const below = composer.y - (divider.y + divider.height)
    expect(Math.abs(above - below)).toBeLessThan(60)
  })
})

test("signed in with nothing read yet: still the demo, without the 'No account needed' badge", async ({ page }) => {
  await setupMocks(page, { signedIn: true })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("No account needed")).toHaveCount(0)
})

test("signed out: the 'No account needed' badge stays", async ({ page }) => {
  await setupMocks(page, { signedIn: false })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Read real Spanish." })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("Free · No account needed")).toBeVisible()
})
