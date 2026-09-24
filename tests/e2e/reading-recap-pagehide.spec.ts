/**
 * "Where you left off" recap: closing the tab (or otherwise never cleanly navigating away)
 * used to mean the recap-generating effect cleanup in App.tsx never ran, so no recap was ever
 * cached for that book -- the next reopen fell back to the plain text excerpt forever. See the
 * `pagehide`/`visibilitychange` listeners next to the leave-triggered effect in App.tsx.
 *
 * `pagehide`/`visibilitychange` fire `sendPageRecapBeaconOnLeave` (a `navigator.sendBeacon` hit
 * on the `recap-beacon` Edge Function), not the plain `fetch`-based `gemini-chat` call the
 * reopen-time background prime (second describe block below) still uses -- see
 * src/lib/translate/page-recap.ts's docstrings for why the two leave-paths need different
 * transports.
 *
 * This needs a real browser lifecycle event (`pagehide`), not just component state, so it's a
 * Playwright test against the e2e-mocks harness rather than a Vitest/RTL one -- see
 * tests/e2e-mocks/README.md.
 */

import { test, expect } from "../e2e-mocks/fixtures"
import { CHAT_EDGE_FUNCTIONS_GLOB } from "../e2e-mocks/supabase-mock"

const PAGE_ONE_TEXT = Array(12)
  .fill(
    "El pequeño pueblo junto al río despertaba lentamente cada mañana con el canto de los pájaros y el aroma del pan recién horneado.",
  )
  .join(" ")

const PAGE_TWO_TEXT = Array(12)
  .fill(
    "Muchos años después, la misma plaza seguía llena de vida, con niños jugando y vecinos charlando bajo los árboles centenarios.",
  )
  .join(" ")

const BOOK_ID = "mock-recap-book-1"

const DISCOVER_ITEMS = [
  {
    id: BOOK_ID,
    title: "Recap Test Book",
    author: "Test Author",
    type: "book",
    difficulty: "beginner",
    word_count: 240,
    language: "Spanish",
    cover_image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop",
    tags: ["Classic"],
    preview: "El pequeño pueblo junto al río...",
    estimated_time: "3 hours",
    created_at: "2024-01-01T00:00:00.000Z",
    // Fetched separately by handleDiscoverStartReading (`.select("body_text")`) -- long enough,
    // across two distinct paragraphs, to guarantee it splits into >1 article page.
    body_text: `${PAGE_ONE_TEXT}\n\n${PAGE_TWO_TEXT}`,
  },
]

// Pro tier: the free plan's per-submission character cap (600 chars) is well under what's
// needed for this book's body text to actually split into more than one article page.
const PRO_SUBSCRIPTION = { status: "active", plan_id: "pro", past_due_since: null }

/** Registers the chat mock both tests below need, capturing the recap request body. */
async function mockChatEdgeFunctions(
  page: import("@playwright/test").Page,
): Promise<{ recapRequestBody: () => unknown }> {
  let recapRequestBody: unknown = null
  // One handler for both proxies: gemini-chat serves the recap *and*, with Gemini as the default
  // translation provider (see llm-settings.ts), the translate call too -- so tell them apart by
  // the translate prompt's own "TEXT:\n" marker rather than by endpoint.
  //
  // Registered after the harness's own default chat mocks (which return a fixed 2-chunk reply
  // regardless of input) -- this repo's later-registered `page.route` wins, and these tests need
  // the real translate flow's chunk-reconcile step to actually succeed for a page as long as our
  // multi-paragraph book, not just for the harness's short default example text (see
  // chunk-reconcile.ts's rebuilt-vs-source check). Echoing the exact page text back as a single
  // chunk always reconciles cleanly, whatever the source text is.
  await page.route(CHAT_EDGE_FUNCTIONS_GLOB, async (route) => {
    const requestBody = route.request().postDataJSON() as {
      messages?: Array<{ role: string; content: string }>
    }
    const userContent = requestBody?.messages?.find((m) => m.role === "user")?.content ?? ""
    // buildChunkSortUserPrompt appends the exact page text after a literal "TEXT:\n" marker.
    const isTranslate = userContent.includes("TEXT:\n")
    if (!isTranslate) recapRequestBody = requestBody
    const content = isTranslate
      ? JSON.stringify([{ c: userContent.split("TEXT:\n").pop() ?? userContent, m: "Translation." }])
      : "A village wakes up by the river."
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      }),
    })
  })
  return { recapRequestBody: () => recapRequestBody }
}

/** Registers the `recap-beacon` mock the `pagehide`/`visibilitychange` path hits instead of `gemini-chat` directly -- see the module docstring. */
async function mockRecapBeacon(
  page: import("@playwright/test").Page,
): Promise<{ recapBeaconBody: () => unknown }> {
  let recapBeaconBody: unknown = null
  await page.route("**/functions/v1/recap-beacon**", async (route) => {
    recapBeaconBody = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  return { recapBeaconBody: () => recapBeaconBody }
}

test.setTimeout(45_000)

test.describe("closing the tab (pagehide)", () => {
  test.use({
    mockOptions: {
      discoverItems: DISCOVER_ITEMS,
      subscription: PRO_SUBSCRIPTION,
      restTables: {
        // No saved progress -- a fresh open, so the only recap trigger in play is `pagehide`
        // itself, not the separate "prime on reopen" path (see the other describe block below).
        reading_progress: [],
      },
    },
  })

  test("generates and caches a recap, not just navigating away", async ({ page }) => {
    // Still needed for the translate override (the actual translate flow, unrelated to the
    // recap) -- see mockChatEdgeFunctions's own comment on why the harness default isn't enough
    // for this book's longer, multi-paragraph text. Its recap branch goes unused by this test
    // (the pagehide path hits recap-beacon, not gemini-chat directly).
    await mockChatEdgeFunctions(page)
    const { recapBeaconBody } = await mockRecapBeacon(page)

    await page.goto("/discover")
    await page.getByRole("button", { name: "Recap Test Book by Test Author" }).first().click()
    await page.getByRole("button", { name: "Start reading" }).click()

    // Advance to article page 2 so there's a "previous page" (page 1) to summarize once we leave.
    await page.getByRole("button", { name: "Next page" }).click()
    await expect(
      page.getByRole("button", { name: /Go to page, currently page 2 of \d+/ }),
    ).toBeVisible()

    // Nothing should have been generated yet -- only leaving triggers it.
    expect(recapBeaconBody()).toBeNull()

    // Simulate the tab closing: dispatch `pagehide` directly rather than actually closing the
    // page, so the mocked network route can still observe the request that fires from it.
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))

    await expect.poll(recapBeaconBody).not.toBeNull()
    const body = recapBeaconBody() as {
      access_token?: string
      contentId?: string
      previousPageSourceText?: string
      forPageIndex?: number
    }
    expect(body.access_token).toBe("mock-access-token")
    expect(body.contentId).toBe(BOOK_ID)
    expect(body.forPageIndex).toBe(0)
    // Summarizes the page *before* the one we left on (page 1's content), not page 2's.
    expect(body.previousPageSourceText).toContain("despertaba lentamente")
  })
})

test.describe("reopening with saved progress but no cached recap", () => {
  // A saved cloud position past page 0, with no recap cached anywhere for it -- e.g. the
  // previous session closed before either the leave-triggered effect or the pagehide/
  // visibilitychange listeners above ever got to run for it.
  test.use({
    mockOptions: {
      discoverItems: DISCOVER_ITEMS,
      subscription: PRO_SUBSCRIPTION,
      restTables: {
        reading_progress: [
          {
            user_id: "00000000-0000-4000-8000-000000000001",
            content_id: BOOK_ID,
            page_index: 1,
            total_pages: 8,
            updated_at: new Date().toISOString(),
          },
        ],
      },
    },
  })

  test("primes a recap for next time in the background, without delaying this modal", async ({
    page,
  }) => {
    const { recapRequestBody } = await mockChatEdgeFunctions(page)

    await page.goto("/discover")
    await page.getByRole("button", { name: "Recap Test Book by Test Author" }).first().click()
    // The saved cloud position (pulled on the Discover page's own mount -- see
    // ensureCloudReadingProgressPulled) means this is a resume, not a first read.
    await page.getByRole("button", { name: "Continue reading" }).click()

    // The modal shows immediately from whatever was (or wasn't) cached -- here, nothing was,
    // so it's the plain excerpt fallback, not a summary. This is the "no added latency" part:
    // it must not wait on the network call below.
    await expect(page.getByText("You left off around:")).toBeVisible()

    // ...but a recap for *this* resume point should still have been kicked off in the
    // background, unprompted, so it's cached and ready the *next* time this book is opened.
    await expect.poll(recapRequestBody).not.toBeNull()
  })
})
