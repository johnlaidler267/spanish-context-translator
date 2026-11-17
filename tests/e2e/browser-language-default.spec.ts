import { test, expect } from "../e2e-mocks/fixtures"

// A first-time visitor whose phone/browser is set to Spanish is most likely learning English,
// so the landing demo opens on an English passage, with everything around it (and the phrase
// meanings) in Spanish. An English browser keeps the Spanish demo explained in English.

const SHOTS = process.env.DEMO_SHOTS

test.describe("spanish browser", () => {
  test.use({ locale: "es-VE", mockOptions: { languagePrefs: null } })
  test("opens the English demo, explained in Spanish", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Lee inglés de verdad/ })).toBeVisible()
    const demo = page.getByRole("region", { name: "Pruébalo" })
    await expect(demo.getByRole("button", { name: "Inglés" })).toHaveAttribute("aria-pressed", "true")
    await expect(demo.getByRole("button", { name: "Español" })).toBeVisible()
    // The showcase phrase's tooltip is open and its meaning is in Spanish.
    await expect(page.locator("[data-popup]", { hasText: "puso el grito en el cielo" }).first()).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/es-desktop.png` })
    // No picker on top of the demo.
    await expect(page.getByRole("heading", { name: "¿Qué idioma estás aprendiendo?" })).toHaveCount(0)

    // Switching to Spanish is for someone practising Spanish: explanations go back to English.
    await demo.getByRole("button", { name: "Español" }).click()
    await expect(page.getByRole("heading", { name: /Read real Spanish/ })).toBeVisible()
    const prefs = await page.evaluate(() => localStorage.getItem("lector-language-learning-preferences"))
    expect(JSON.parse(prefs!)).toEqual({ learning: "spanish", native: "english" })
  })
})

test.describe("french browser", () => {
  test.use({ locale: "fr-FR", mockOptions: { languagePrefs: null } })
  test("opens the English demo, explained in French", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Lisez du vrai anglais/ })).toBeVisible()
    await expect(page.locator("[data-popup]", { hasText: "a piqué une crise" }).first()).toBeVisible()
  })
})

test.describe("english browser", () => {
  test.use({ locale: "en-US", mockOptions: { languagePrefs: null } })
  test("still opens on the Spanish demo", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText(/Read real Spanish/)).toBeVisible()
    const demo = page.getByRole("region", { name: "Try it" })
    await expect(demo.getByRole("button", { name: "Spanish" })).toHaveAttribute("aria-pressed", "true")
    await expect(demo.getByRole("button", { name: "French" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "What are you learning?" })).toHaveCount(0)
  })
})
