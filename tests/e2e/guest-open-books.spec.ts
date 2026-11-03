/**
 * Signed-out visitors can read a Discover book a curator marked open_to_guests (the short
 * LexaLens Originals beginner stories), while every other book still asks them to sign in.
 */

import { test, expect } from "@playwright/test"
import { setupMocks, SAMPLE_DISCOVER_ITEMS } from "../e2e-mocks/supabase-mock"

test.setTimeout(60_000)

const OPEN_STORY = {
  id: "mock-open-story",
  title: "El gato de la señora Rosa",
  author: "LexaLens Originals",
  type: "book",
  difficulty: "beginner",
  word_count: 400,
  language: "Spanish",
  cover_image: "",
  tags: ["Short Story"],
  preview: "La señora Rosa vive en una casa pequeña y azul, al final de la calle.",
  body_text: "La señora Rosa vive en una casa pequeña y azul, al final de la calle. Tiene un gato gris.",
  estimated_time: "3 min",
  is_private: false,
  open_to_guests: true,
  created_at: "2026-11-03T00:00:00.000Z",
  updated_at: "2026-11-03T00:00:00.000Z",
}

const START_READING = /start reading/i

test("a guest can open a book marked open to guests", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [OPEN_STORY, ...SAMPLE_DISCOVER_ITEMS] })
  await page.goto("/discover")
  await page.getByText(OPEN_STORY.title).first().click()
  await page.getByRole("button", { name: START_READING }).first().click()
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  await expect(page.getByText("Sign in to read books")).toHaveCount(0)
})

test("other books still ask a guest to sign in", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [OPEN_STORY, ...SAMPLE_DISCOVER_ITEMS] })
  await page.goto("/discover")
  await page.getByText("El Principito").first().click()
  await page.getByRole("button", { name: START_READING }).first().click()
  await expect(page.getByText("Sign in to read books")).toBeVisible({ timeout: 10_000 })
})

test("landing leads with the open story for a guest", async ({ page }) => {
  await setupMocks(page, { signedIn: false, discoverItems: [...SAMPLE_DISCOVER_ITEMS, OPEN_STORY] })
  await page.goto("/")
  const titles = page.locator(".continue-reading__row h3")
  await expect(titles.first()).toHaveText(OPEN_STORY.title, { timeout: 20_000 })
  await expect(page.getByText("Try a short read")).toBeVisible()
})
