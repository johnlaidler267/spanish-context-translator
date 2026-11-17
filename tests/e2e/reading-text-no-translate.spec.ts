/**
 * Browser auto-translate (e.g. Chrome on a Spanish-language phone) used to translate the text
 * being learned along with the UI, defeating the point and rewriting text React owns (a known
 * crash source). Reading text is marked translate="no"; the tooltip with its explanation stays
 * translatable.
 */

import { test, expect, type Locator } from "../e2e-mocks/fixtures"

const CHUNKS = [
  { c: "El gato", m: "the cat" },
  { c: "duerme", m: "sleeps" },
  { c: "en la casa.", m: "in the house." },
]

/** Visible text nodes under `root` whose element would be translated by the browser. */
const translatableText = (root: Locator) =>
  root.evaluate((el) => {
    const out: string[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim()
      if (text && n.parentElement?.translate !== false) out.push(text)
    }
    return out
  })

test.describe("reader", () => {
  test.use({ mockOptions: { groqChatContent: JSON.stringify(CHUNKS) } })

  test("the page text is not offered to browser translation", async ({ page }) => {
    await page.goto("/")
    await page.locator("textarea").fill(CHUNKS.map((x) => x.c).join(" "))
    await page.getByRole("button", { name: "Start reading" }).click()
    const article = page.locator("article")
    await expect(article.locator("[data-chunk]").first()).toBeVisible({ timeout: 20_000 })
    expect(await translatableText(article)).toEqual([])
  })
})

test.describe("landing demo", () => {
  test.use({ mockOptions: { languagePrefs: null } })

  test("the demo passage is not offered to browser translation", async ({ page }) => {
    await page.goto("/")
    const passage = page.locator(".landing-demo__passage")
    await expect(passage.locator("[data-chunk]").first()).toBeVisible()
    expect(await translatableText(passage)).toEqual([])
  })
})
