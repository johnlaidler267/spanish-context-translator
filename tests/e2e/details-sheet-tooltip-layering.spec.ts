/**
 * Moving the mouse from the text onto the open word-details sheet used to leave the last-hovered
 * word "active", so its translation tooltip (portaled above everything) stayed painted on top of
 * the sheet — often for a word the sheet itself now covers.
 */

import { test, expect } from "../e2e-mocks/fixtures"

const CHUNKS = Array.from({ length: 50 }, (_, i) => ({ c: `Pal${i}.`, m: `meaning-${i}` }))

test.use({ mockOptions: { groqChatContent: JSON.stringify(CHUNKS) } })

test("leaving the text for the details sheet drops the hovered word's tooltip", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 })
  await page.goto("/")
  await page.locator("textarea").fill(CHUNKS.map((x) => x.c).join(" "))
  await page.getByRole("button", { name: "Start reading" }).click()

  const chunks = page.locator("article [data-chunk]")
  await chunks.first().click()
  const sheet = page.locator("[data-details-box] > *").first()
  await expect(sheet).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(600) // let the sheet finish sliding up
  const sheetTop = (await sheet.boundingBox())!.y

  // The last word whose box sits fully above the sheet.
  const boxes = await chunks.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, bottom: r.bottom, text: el.textContent }
    }),
  )
  const target = boxes.filter((b) => b.bottom < sheetTop - 4).at(-1)!
  const meaning = CHUNKS.find((x) => x.c === target.text?.trim())!.m

  // Tooltips stay mounted and fade to opacity 0 when hidden.
  const popup = page.locator("[data-popup]", { hasText: meaning }).first()
  const opacity = () => popup.evaluate((el) => Number(getComputedStyle(el).opacity))

  await page.mouse.move(target.x, target.y, { steps: 5 })
  await expect.poll(opacity).toBe(1)

  await page.mouse.move(target.x, sheetTop + 60, { steps: 10 })
  await expect.poll(opacity).toBe(0)
})
