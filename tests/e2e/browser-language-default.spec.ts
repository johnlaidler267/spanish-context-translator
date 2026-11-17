import { test, expect } from "../e2e-mocks/fixtures"

// A first-time visitor whose phone/browser is set to Spanish is most likely learning English,
// so the landing page asks in Spanish with English first instead of opening the Spanish demo.

test.describe("spanish browser", () => {
  test.use({ locale: "es-VE", mockOptions: { languagePrefs: null } })
  test("shows the picker in Spanish with English first", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "¿Qué idioma estás aprendiendo?" })).toBeVisible()
    await page.getByRole("button", { name: /Inglés/ }).click()
    const prefs = await page.evaluate(() => localStorage.getItem("lector-language-learning-preferences"))
    expect(JSON.parse(prefs!)).toEqual({ learning: "english", native: "spanish" })
  })
})

test.describe("english browser", () => {
  test.use({ locale: "en-US", mockOptions: { languagePrefs: null } })
  test("still opens on the Spanish demo", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText(/Read real Spanish/)).toBeVisible()
    await expect(page.getByRole("heading", { name: "What are you learning?" })).toHaveCount(0)
  })
})
