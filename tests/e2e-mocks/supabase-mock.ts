/**
 * Reusable Playwright mocking harness for LexaLens.
 *
 * Fakes a signed-in Supabase session and intercepts the backend calls a normal
 * signed-in flow makes (Supabase Auth, PostgREST tables, and the groq-chat /
 * chunk-details / track-usage Edge Functions), so a Playwright test can drive real
 * pages/components against a local build with no real Supabase project or Groq key.
 *
 * See tests/e2e-mocks/README.md for how to use this in a new test, and — importantly —
 * when to prefer this over a Vitest/RTL component test instead.
 */

import type { Page } from "@playwright/test"

// ─── Fixed test env ─────────────────────────────────────────────────────────────
//
// These MUST match the VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the dev/preview
// server is started with (see playwright.config.ts `webServer.env`) — Vite inlines
// `import.meta.env.VITE_*` from those at request/build time, so the app's actual
// supabase-js client is pointed at this URL. Also matches the dummy vitest uses
// (see vite.config.js `test.env`), so it's consistent across both test layers.

export const MOCK_SUPABASE_URL = "https://example.supabase.co"
export const MOCK_SUPABASE_ANON_KEY = "test-anon-key"

// ─── Fake signed-in user / session ──────────────────────────────────────────────

export interface MockUser {
  id: string
  email: string
}

export const DEFAULT_MOCK_USER: MockUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test-user@example.com",
}

/**
 * supabase-js's storage key for the persisted session, derived the same way the
 * client itself does it: `sb-<first label of the URL's hostname>-auth-token`
 * (see node_modules/@supabase/supabase-js SupabaseClient constructor). Seeding
 * localStorage under this exact key is what makes GoTrueClient treat the page as
 * already signed in on load, with no network round-trip.
 */
export function supabaseAuthStorageKey(supabaseUrl: string = MOCK_SUPABASE_URL): string {
  const hostname = new URL(supabaseUrl).hostname
  return `sb-${hostname.split(".")[0]}-auth-token`
}

function buildFakeSession(user: MockUser) {
  const nowSec = Math.floor(Date.now() / 1000)
  const nowIso = new Date().toISOString()
  const authUser = {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
    confirmed_at: nowIso,
    email_confirmed_at: nowIso,
    last_sign_in_at: nowIso,
    is_anonymous: false,
  }
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    // Comfortably beyond any single test run — avoids supabase-js's background
    // auto-refresh tick firing a real (unmocked) refresh request mid-test.
    expires_at: nowSec + 3600,
    user: authUser,
  }
}

export type FakeSession = ReturnType<typeof buildFakeSession>

/**
 * Seed a signed-in Supabase session into localStorage *before* any page script runs.
 * Combine with `mockAuthRoutes` (or just use `setupMocks`, which does both) so calls
 * that validate the session server-side (e.g. `supabase.auth.getUser()`, used by
 * `checkSubscriptionStatus`) also resolve as this same user instead of hitting a
 * real — and here, nonexistent — Supabase project.
 */
export async function mockSignedInSession(
  page: Page,
  opts: { user?: Partial<MockUser>; supabaseUrl?: string } = {},
): Promise<FakeSession> {
  const user: MockUser = { ...DEFAULT_MOCK_USER, ...opts.user }
  const session = buildFakeSession(user)
  const storageKey = supabaseAuthStorageKey(opts.supabaseUrl ?? MOCK_SUPABASE_URL)
  const serialized = JSON.stringify(session)
  await page.addInitScript(
    ({ storageKey: key, value }) => {
      window.localStorage.setItem(key, value)
    },
    { storageKey, value: serialized },
  )
  return session
}

/** Intercepts the Supabase Auth (GoTrue) endpoints the app actually calls for an already-signed-in session. */
export async function mockAuthRoutes(
  page: Page,
  session: FakeSession,
  opts: { supabaseUrl?: string } = {},
): Promise<void> {
  const base = opts.supabaseUrl ?? MOCK_SUPABASE_URL
  // `supabase.auth.getUser()` — unlike getSession(), this always makes a network call
  // to validate the token server-side. checkSubscriptionStatus() calls it on every load.
  await page.route(`${base}/auth/v1/user**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session.user),
    }),
  )
  // Token refresh (grant_type=refresh_token/password/etc). Shouldn't normally fire given
  // the long expiry above, but mocked defensively so an unexpected refresh doesn't hang
  // the test on a real network request.
  await page.route(`${base}/auth/v1/token**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    }),
  )
}

// ─── PostgREST table mocks ──────────────────────────────────────────────────────

/**
 * Mocks a `supabase.from(table)...` call (list `select()`, `.single()`, and
 * `.maybeSingle()` alike — the client always requests/parses a plain JSON array
 * over the wire and unwraps to one row itself for single/maybeSingle, so a plain
 * rows array is all any of these need). Route stays registered until the page/context
 * is closed; call again with new rows to change what a table returns mid-test.
 */
export async function mockRestTable(
  page: Page,
  table: string,
  rows: unknown[],
  opts: { supabaseUrl?: string } = {},
): Promise<void> {
  const base = opts.supabaseUrl ?? MOCK_SUPABASE_URL
  await page.route(`${base}/rest/v1/${table}**`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } })
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      body: JSON.stringify(rows),
    })
  })
}

// ─── Edge Function mocks ────────────────────────────────────────────────────────

/**
 * Generic escape hatch for mocking any `supabase/functions/v1/<name>` Edge Function
 * not already covered by `setupMocks` — e.g. `gemini-chat`, `groq-transcribe`,
 * `chunk-memory-trick`. `body` may be a static JSON-serializable value or a function
 * (called per-request, receiving the parsed request body) for dynamic responses.
 */
export async function mockEdgeFunction(
  page: Page,
  functionName: string,
  body: unknown | ((requestBody: unknown) => unknown),
  opts: { status?: number; supabaseUrl?: string } = {},
): Promise<void> {
  const base = opts.supabaseUrl ?? MOCK_SUPABASE_URL
  await page.route(`${base}/functions/v1/${functionName}**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } })
    }
    let payload = body
    if (typeof body === "function") {
      let requestBody: unknown = null
      try {
        requestBody = route.request().postDataJSON()
      } catch {
        /* non-JSON body (e.g. groq-transcribe's multipart form) — pass null through */
      }
      payload = (body as (requestBody: unknown) => unknown)(requestBody)
    }
    return route.fulfill({
      status: opts.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    })
  })
}

/**
 * Default fake groq-chat completion. The real Edge Function just proxies Groq's
 * OpenAI-compatible response shape, so this is what `fetchGroqChatViaEdge()` gets
 * back either way. `content` is the LLM's raw text — for the actual translate flow
 * the app parses this as a JSON array of `{c, m, l?, n?}` chunks (see
 * src/lib/translate/chunk-reconcile.ts); the default below is a minimal example of
 * that shape. Override via `setupMocks({ groqChatContent })` for a test that needs
 * specific translated content, or via `mockEdgeFunction(page, "groq-chat", ...)`
 * directly for full control over the response envelope.
 */
function buildGroqChatResponse(content: string) {
  return {
    id: "mock-chatcmpl-1",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "openai/gpt-oss-120b",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }
}

const DEFAULT_GROQ_CHAT_CONTENT = JSON.stringify([
  { c: "Hola", m: "Hello" },
  { c: "mundo", m: "world" },
])

/** Default chunk-details response — see supabase/functions/chunk-details/index.ts for the full contract (kind "verb" | "other"). */
const DEFAULT_CHUNK_DETAILS = {
  kind: "other",
  explanation: "Mocked grammar explanation from the e2e test harness.",
}

/**
 * Default track-usage response: every metric at 0/unlimited, nothing exceeded. Real
 * metric keys live in supabase/functions/_shared/usage-metrics.ts (UsageMetric) —
 * extend via `setupMocks({ trackUsage })` if a test needs specific counters/limits.
 */
const DEFAULT_TRACK_USAGE = {
  allowed: true,
  counters: {
    texts_submitted: 0,
    texts_submitted_today: 0,
    chunks_returned: 0,
    pages_processed: 0,
    chars_processed: 0,
    chars_processed_period: 0,
    chars_processed_today: 0,
    api_calls: 0,
    voice_requests: 0,
  },
  limits: {
    texts_submitted: null,
    texts_submitted_today: null,
    chunks_returned: null,
    pages_processed: null,
    chars_processed: null,
    chars_processed_period: null,
    chars_processed_today: null,
    api_calls: null,
    voice_requests: null,
  },
  exceeded: [],
  tierId: "free",
  period: {
    start: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
    end: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
  },
}

// ─── Sample Discover catalog ────────────────────────────────────────────────────

/** Matches the `discover_items` list-select shape (see src/lib/discover/discover-map.ts DiscoverListRow). */
export const SAMPLE_DISCOVER_ITEMS = [
  {
    id: "mock-item-1",
    title: "El Principito",
    author: "Antoine de Saint-Exupéry",
    type: "book",
    difficulty: "beginner",
    word_count: 16500,
    language: "Spanish",
    cover_image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop",
    tags: ["Classic", "Fantasy"],
    preview: "Cuando yo tenía seis años vi en un libro sobre la selva virgen...",
    estimated_time: "3 hours",
    created_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "mock-item-2",
    title: "Despacito",
    author: "Luis Fonsi",
    type: "song",
    difficulty: "beginner",
    word_count: 420,
    language: "Spanish",
    cover_image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=600&fit=crop",
    tags: ["Pop", "Latin"],
    preview: "Sí, sabes que ya llevo un rato mirándote...",
    estimated_time: "5 min",
    created_at: "2024-01-02T00:00:00.000Z",
  },
]

// ─── Ergonomic entry point ───────────────────────────────────────────────────────

export interface SetupMocksOptions {
  /** Set false to test the signed-out / guest experience instead. Default true. */
  signedIn?: boolean
  user?: Partial<MockUser>
  /** Rows returned for `discover_items` list selects. Default: SAMPLE_DISCOVER_ITEMS. */
  discoverItems?: unknown[]
  /**
   * Row(s) for `user_subscriptions`. Default: [] (no row — checkSubscriptionStatus
   * treats this as the free tier, same as a real just-signed-up account).
   */
  subscription?: Record<string, unknown> | Record<string, unknown>[] | null
  /** Extra PostgREST table mocks beyond discover_items/user_subscriptions: table name -> rows. */
  restTables?: Record<string, unknown[]>
  /** Overrides the groq-chat mock's `choices[0].message.content` (see buildGroqChatResponse doc above). */
  groqChatContent?: string
  /** Overrides the chunk-details mock response body. */
  chunkDetails?: Record<string, unknown>
  /** Overrides the track-usage mock response body. */
  trackUsage?: Record<string, unknown>
  supabaseUrl?: string
}

/**
 * One-call setup: fakes a signed-in session (unless `signedIn: false`) and wires up
 * the standard backend mocks (auth, discover_items, user_subscriptions, groq-chat,
 * chunk-details, track-usage). Call this before `page.goto(...)`, in place of
 * hand-rolled route interception. Returns the mock user (or null when signed out).
 *
 * Add more Playwright routes with `page.route(...)` / `mockEdgeFunction(...)`
 * afterwards for anything a specific test needs beyond this default set.
 */
export async function setupMocks(
  page: Page,
  options: SetupMocksOptions = {},
): Promise<{ user: MockUser | null }> {
  const { signedIn = true, supabaseUrl } = options

  let user: MockUser | null = null
  if (signedIn) {
    user = { ...DEFAULT_MOCK_USER, ...options.user }
    const session = await mockSignedInSession(page, { user, supabaseUrl })
    await mockAuthRoutes(page, session, { supabaseUrl })
  }

  const subscriptionRows =
    options.subscription == null ? [] : Array.isArray(options.subscription) ? options.subscription : [options.subscription]

  await mockRestTable(page, "discover_items", options.discoverItems ?? SAMPLE_DISCOVER_ITEMS, { supabaseUrl })
  await mockRestTable(page, "user_subscriptions", subscriptionRows, { supabaseUrl })
  for (const [table, rows] of Object.entries(options.restTables ?? {})) {
    await mockRestTable(page, table, rows, { supabaseUrl })
  }

  await mockEdgeFunction(page, "groq-chat", () => buildGroqChatResponse(options.groqChatContent ?? DEFAULT_GROQ_CHAT_CONTENT), {
    supabaseUrl,
  })
  await mockEdgeFunction(page, "chunk-details", options.chunkDetails ?? DEFAULT_CHUNK_DETAILS, { supabaseUrl })
  await mockEdgeFunction(page, "track-usage", options.trackUsage ?? DEFAULT_TRACK_USAGE, { supabaseUrl })

  return { user }
}
