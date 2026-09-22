/**
 * Landing page hero greeting (LexaLens board card cmubtvr29zvajx: "Mobile phone size landing
 * page greeting text gets cut off by continue reading section"). On a short mobile viewport
 * with a two-line greeting (long display name) and the Continue Reading row present, `.hero-mark`
 * (flex-1, min-h-0, max-md:overflow-y-auto -- see landing-screen.tsx) doesn't get enough height
 * from its flex parent to fit the hero illustration + heading, and overflows. The browser's
 * safe-alignment fallback for an overflowing scroll container keeps the *first* flex child
 * (the decorative image) fully in view and silently clips the *last* one (the heading) instead,
 * with no visible scroll affordance -- reading as the greeting being cut off by the section below
 * it. Root cause was two compounding bugs, both fixed in landing-screen.tsx:
 *  1. The hero image's height cap used an invalid Tailwind class, `max-h-18` -- "18" isn't in
 *     Tailwind's default spacing scale, so the class generated no CSS at all and the image
 *     rendered far taller (~134px) than the intended 4.5rem (~72px) cap, eating into the
 *     already-tight mobile hero budget.
 *  2. Even with the cap fixed, the image (first child) and heading (last child) both had the
 *     browser's default flex-shrink: 1 with an automatic (non-zero) minimum size, so on very
 *     short viewports the two would still overflow together rather than the decorative image
 *     yielding space to the heading. Marking the image `min-h-0 shrink` and the heading
 *     `shrink-0` makes the image the one that shrinks (down to near-zero if needed) so the
 *     heading text is always the thing that stays fully visible.
 *
 * Uses tests/e2e-mocks (see its README) instead of a real Supabase project/Groq key.
 */

import { test, expect } from "@playwright/test"
import { setupMocks, DEFAULT_MOCK_USER } from "../e2e-mocks/supabase-mock"
import { READING_PROGRESS_STORAGE_KEY } from "../../src/lib/storage/reading-progress-storage"
import { DISPLAY_NAME_STORAGE_KEY } from "../../src/lib/storage/display-name-storage"

async function seedContinueReadingProgress(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ key, userId }) => {
      const now = Date.now()
      const all = {
        [userId]: {
          "mock-item-1": { pageIndex: 1, totalPages: 4, updatedAt: now },
          "mock-item-2": { pageIndex: 1, totalPages: 4, updatedAt: now - 1000 },
        },
      }
      window.localStorage.setItem(key, JSON.stringify(all))
    },
    { key: READING_PROGRESS_STORAGE_KEY, userId: DEFAULT_MOCK_USER.id },
  )
}

async function seedDisplayName(page: import("@playwright/test").Page, name: string) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: DISPLAY_NAME_STORAGE_KEY, value: name },
  )
}

// 360x600 / 390x664 are deliberately short -- real-world equivalents of a phone with the
// browser's URL bar still on screen (as in the board card's screenshot), which eats a good
// chunk of the viewport height this layout has to fit the hero into.
const viewports = [
  { width: 390, height: 664, label: "iphone-with-chrome" },
  { width: 360, height: 600, label: "short-android" },
]

for (const vp of viewports) {
  test(`hero greeting stays fully visible at ${vp.label} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await setupMocks(page)
    await seedContinueReadingProgress(page)
    await seedDisplayName(page, "Juan Alejandro")

    await page.goto("/")

    const heading = page.locator("h1.wordmark")
    await expect(heading).toBeVisible()

    const mobileRow = page.locator(".continue-reading-mobile")
    await expect(mobileRow).toBeVisible()

    const headingBox = await heading.boundingBox()
    const rowBox = await mobileRow.boundingBox()
    // The real clipping boundary is .hero-mark's own rendered box (it's the overflow:auto
    // ancestor) -- the heading must not extend below it, or its text is invisibly clipped even
    // though its own layout box ("boundingBox()") still reports the full, unclipped size.
    const heroMarkBox = await page.locator(".hero-mark").boundingBox()
    expect(headingBox).not.toBeNull()
    expect(rowBox).not.toBeNull()
    expect(heroMarkBox).not.toBeNull()

    expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(heroMarkBox!.y + heroMarkBox!.height + 1)
    // Sanity: also stay clear of the continue-reading row below.
    expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(rowBox!.y + 1)
  })
}
