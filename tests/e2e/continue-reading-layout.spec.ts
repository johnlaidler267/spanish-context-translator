/**
 * Landing page "Continue Reading" row (LexaLens board card "Fix continue reading section
 * layout for single book"). Reproduces + confirms the fix: with fewer than
 * MAX_CONTINUE_READING_ITEMS (4) items, `.continue-reading__row .discover-card` used
 * `flex: 1 1 0` with no `max-width`, so flex-grow stretched the lone/few cards to fill the
 * entire row -- a single book's cover read as a giant full-bleed banner instead of a card
 * (see the reference screenshot on the board card). Asserts each card's rendered width stays
 * under a sane cap regardless of how many items are shown (1, 2, 3, 4). A lone item is
 * intentionally a wider landscape "shelf" card (`.continue-reading__row--solo`, capped at
 * 28rem), so it gets its own cap -- still well short of the full row.
 *
 * Uses tests/e2e-mocks (see its README) instead of a real Supabase project/Groq key.
 */

import { test, expect } from "@playwright/test"
import { setupMocks, DEFAULT_MOCK_USER } from "../e2e-mocks/supabase-mock"
import { READING_PROGRESS_STORAGE_KEY } from "../../src/lib/storage/reading-progress-storage"

const DISCOVER_ITEMS = [1, 2, 3, 4].map((n) => ({
  id: `mock-continue-${n}`,
  title: `Libro de Prueba ${n}`,
  author: "Autor de Prueba",
  type: "book",
  difficulty: "beginner",
  word_count: 5000,
  language: "Spanish",
  cover_image: `https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop&sig=${n}`,
  tags: ["Test"],
  preview: "Texto de muestra para la prueba.",
  estimated_time: "1 hour",
  created_at: `2024-01-0${n}T00:00:00.000Z`,
}))

/** Seeds `count` recently-viewed entries (newest first by `updatedAt`) for the signed-in mock
 *  user, matching that many of DISCOVER_ITEMS -- this is what makes useLandingContinueReading
 *  render exactly `count` cards (see buildContinueReadingItems). */
async function seedContinueReadingProgress(page: import("@playwright/test").Page, count: number) {
  await page.addInitScript(
    ({ key, userId, items }) => {
      const now = Date.now()
      const scoped: Record<string, unknown> = {}
      items.forEach((id: string, i: number) => {
        scoped[id] = { pageIndex: 1, totalPages: 4, updatedAt: now - i * 1000 }
      })
      const all = { [userId]: scoped }
      window.localStorage.setItem(key, JSON.stringify(all))
    },
    {
      key: READING_PROGRESS_STORAGE_KEY,
      userId: DEFAULT_MOCK_USER.id,
      items: DISCOVER_ITEMS.slice(0, count).map((item) => item.id),
    },
  )
}

for (const count of [1, 2, 3, 4]) {
  test(`renders ${count} card(s) at a sane width, not full-bleed`, async ({ page }) => {
    await setupMocks(page, {
      discoverItems: DISCOVER_ITEMS,
      restTables: { reading_progress: [] },
    })
    await seedContinueReadingProgress(page, count)

    await page.goto("/")

    const row = page.locator(".continue-reading__row")
    await expect(row).toBeVisible()
    const cards = row.locator(".discover-card")
    await expect(cards).toHaveCount(count)

    const rowBox = await row.boundingBox()
    expect(rowBox).not.toBeNull()

    for (let i = 0; i < count; i++) {
      const box = await cards.nth(i).boundingBox()
      expect(box).not.toBeNull()
      // The bug: a lone/few card(s) grew via flex-grow to fill the entire ~800px row.
      // Post-fix, max-width caps every card well under that regardless of count -- 28rem
      // (448px) for the solo landscape card, a portrait-card width otherwise.
      expect(box!.width).toBeLessThan(count === 1 ? 450 : 230)
      expect(box!.width).toBeGreaterThan(100)
      // Never wider than the row itself (sanity check against a bad selector/empty row).
      expect(box!.width).toBeLessThanOrEqual(rowBox!.width)
    }
  })
}
