/**
 * Landing page Continue Reading cards must get the same hover effect in dark mode as in light:
 * lift, tinted border, and a deeper shadow. The bug: `.dark .discover-card` ties
 * `.discover-card:hover` on specificity and comes later in index.css, so in dark mode its
 * resting box-shadow overrode the hover shadow -- the card lifted but its shadow never changed.
 *
 * Uses tests/e2e-mocks (see its README) instead of a real Supabase project/Groq key.
 */

import { test, expect } from "@playwright/test"
import { setupMocks, DEFAULT_MOCK_USER } from "../e2e-mocks/supabase-mock"
import { READING_PROGRESS_STORAGE_KEY } from "../../src/lib/storage/reading-progress-storage"
import { READING_THEME_STORAGE_KEY } from "../../src/lib/storage/theme-storage"

const ITEMS = [1, 2, 3].map((n) => ({
  id: `mock-hover-${n}`,
  title: `Libro ${n}`,
  author: "Autor",
  type: "book",
  difficulty: "beginner",
  word_count: 5000,
  language: "Spanish",
  cover_image: "",
  tags: ["Test"],
  preview: "Texto de muestra.",
  estimated_time: "1 hour",
  created_at: `2024-01-0${n}T00:00:00.000Z`,
}))

for (const theme of ["light", "dark"] as const) {
  test(`a Continue Reading card lifts, tints and deepens its shadow on hover (${theme})`, async ({ page }) => {
    await setupMocks(page, { discoverItems: ITEMS, restTables: { reading_progress: [] } })
    await page.addInitScript(
      ({ progressKey, themeKey, theme, userId, ids }) => {
        const scoped: Record<string, unknown> = {}
        ids.forEach((id: string, i: number) => {
          scoped[id] = { pageIndex: 1, totalPages: 4, updatedAt: Date.now() - i * 1000 }
        })
        localStorage.setItem(progressKey, JSON.stringify({ [userId]: scoped }))
        localStorage.setItem(themeKey, theme)
      },
      {
        progressKey: READING_PROGRESS_STORAGE_KEY,
        themeKey: READING_THEME_STORAGE_KEY,
        theme,
        userId: DEFAULT_MOCK_USER.id,
        ids: ITEMS.map((item) => item.id),
      },
    )
    await page.goto("/")
    const card = page.locator(".continue-reading__row .discover-card").first()
    await expect(card).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(theme === "dark")

    const style = () =>
      card.evaluate((el) => {
        const s = getComputedStyle(el)
        return { transform: s.transform, border: s.borderColor, shadow: s.boxShadow }
      })
    const rest = await style()
    await card.hover()
    await expect.poll(async () => (await style()).transform).toBe("matrix(1, 0, 0, 1, 0, -4)")
    await expect.poll(async () => (await style()).shadow).not.toBe(rest.shadow)
    expect((await style()).border).not.toBe(rest.border)
  })
}
