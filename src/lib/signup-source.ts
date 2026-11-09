/**
 * Marketing-channel attribution ("which post brought this user?").
 *
 * Shared links carry a tag: `lexalens.com/?ref=linkedin`, or the standard
 * `?utm_source=reddit&utm_medium=post&utm_campaign=launch`. On page load we keep the
 * first tag this browser ever saw (first touch wins) in localStorage, then once a
 * Supabase session exists -- guest or real account -- write it to `signup_sources`
 * (migration 0035). Each user id is written at most once; a guest who later signs in
 * gets a second row under the real account, since that's a different user id.
 *
 * Everything here is best-effort: storage or network failures must never affect the app.
 */
import { supabase } from "@/lib/supabase"

const STORAGE_KEY = "lexalens.signupSource.v1"
const RECORDED_KEY = "lexalens.signupSource.recordedUserIds.v1"

export interface SignupSource {
  source: string
  utm_medium: string | null
  utm_campaign: string | null
  landing_path: string | null
  referrer: string | null
  first_seen_at: string
}

function clean(value: string | null, max: number): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed.slice(0, max) : null
}

/** Parses a tag from a query string. Returns null when the URL carries none. */
export function parseSignupSource(
  search: string,
  pathname: string,
  referrer: string,
  now: Date = new Date(),
): SignupSource | null {
  const params = new URLSearchParams(search)
  const source = clean(params.get("ref"), 100) ?? clean(params.get("utm_source"), 100)
  if (!source) return null
  return {
    source,
    utm_medium: clean(params.get("utm_medium"), 100),
    utm_campaign: clean(params.get("utm_campaign"), 200),
    landing_path: pathname.slice(0, 500) || null,
    referrer: referrer ? referrer.slice(0, 500) : null,
    first_seen_at: now.toISOString(),
  }
}

export function getStoredSignupSource(): SignupSource | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SignupSource) : null
  } catch {
    return null
  }
}

/** Call once on page load. Stores the URL's tag unless this browser already has one. */
export function captureSignupSource(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return
    const parsed = parseSignupSource(
      window.location.search,
      window.location.pathname,
      document.referrer,
    )
    if (parsed) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // Storage blocked (private mode etc.) -- attribution is optional.
  }
}

function getRecordedUserIds(): string[] {
  try {
    const raw = localStorage.getItem(RECORDED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

/**
 * Writes the stored tag for this user if there is one and it hasn't been written yet.
 * Insert-or-ignore: an existing row (first touch) is never overwritten.
 */
export async function recordSignupSource(userId: string): Promise<void> {
  const stored = getStoredSignupSource()
  if (!stored) return
  const recorded = getRecordedUserIds()
  if (recorded.includes(userId)) return

  try {
    const { error } = await supabase
      .from("signup_sources")
      .upsert({ user_id: userId, ...stored }, { onConflict: "user_id", ignoreDuplicates: true })
    if (error) return // Retry on a later load.
    localStorage.setItem(RECORDED_KEY, JSON.stringify([...recorded, userId].slice(-10)))
  } catch {
    // Network/storage failure -- retry on a later load.
  }
}
