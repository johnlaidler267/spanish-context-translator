/**
 * Supabase client singleton — typed against the full database schema.
 *
 * Required env vars (set in .env):
 *   VITE_SUPABASE_URL       — e.g. https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — the project's public anon key
 */

import { createClient, type User } from "@supabase/supabase-js"
import type { Database } from "@/lib/db-types"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.",
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * The localStorage key supabase-js persists the session under when no `storageKey` override is
 * passed to `createClient` (as here): `sb-<first label of the URL's hostname>-auth-token`. Kept
 * in sync with tests/e2e-mocks/supabase-mock.ts, which seeds a fake session under this same key.
 */
const supabaseAuthStorageKey = (() => {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  } catch {
    return null
  }
})()

/**
 * Synchronously reads the signed-in user out of the session supabase-js already persisted to
 * localStorage, without waiting for the client to initialize or for `onAuthStateChange` to fire.
 * Used to seed auth state on first render so a returning user's page doesn't paint "signed out"
 * for the ~300ms restoring the real session takes, then flip once it lands. Best-effort — never
 * throws (private browsing can make localStorage inaccessible, the value can be absent or
 * corrupt) — and can be wrong in the rare case a token expired or was revoked elsewhere;
 * `onAuthStateChange` still runs afterward and corrects it either way.
 */
export function getCachedSupabaseUser(): User | null {
  if (typeof window === "undefined" || !supabaseAuthStorageKey) return null
  try {
    const raw = window.localStorage.getItem(supabaseAuthStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: User } | null
    return parsed?.user ?? null
  } catch {
    return null
  }
}

/**
 * Synchronously reads the current access token out of the same persisted session
 * `getCachedSupabaseUser` reads -- no `await supabase.auth.getSession()` round trip. Used by
 * the `pagehide`/`visibilitychange` "Where you left off" recap beacon (see
 * `sendPageRecapBeaconOnLeave` in page-recap.ts), which needs the token *immediately* while the
 * tab may already be tearing down -- an async call has no guarantee of resolving before that.
 * Best-effort like its sibling: never throws, can be stale if the token was just revoked
 * elsewhere, and that's fine here since the token is only ever used for one best-effort,
 * silently-absorbed-on-failure write.
 */
export function getCachedSupabaseAccessToken(): string | null {
  if (typeof window === "undefined" || !supabaseAuthStorageKey) return null
  try {
    const raw = window.localStorage.getItem(supabaseAuthStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { access_token?: string } | null
    return typeof parsed?.access_token === "string" ? parsed.access_token : null
  } catch {
    return null
  }
}

/**
 * Get the current session's JWT access token.
 * Returns null if the user is not authenticated.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
