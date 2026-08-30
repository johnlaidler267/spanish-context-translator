/**
 * Guest usage tracking — purely localStorage, no backend required.
 *
 * Unauthenticated users get GUEST_LIMIT free text submissions before they
 * are prompted to sign up. The counter is keyed to the browser and resets
 * when the user signs in (clearGuestUses).
 */

export const GUEST_LIMIT = 3
const STORAGE_KEY = "guest_tries_used"
/** Previous key — migrated once on read. */
const LEGACY_STORAGE_KEY = "lector_guest_uses"

export function getGuestUses(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw != null) return parseInt(raw, 10) || 0
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy != null) {
      const n = parseInt(legacy, 10) || 0
      localStorage.setItem(STORAGE_KEY, String(n))
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return n
    }
    return 0
  } catch {
    return 0
  }
}

/** Increment and return the new count. */
export function incrementGuestUses(): number {
  const next = getGuestUses() + 1
  try {
    localStorage.setItem(STORAGE_KEY, String(next))
  } catch { /* storage blocked (e.g. private mode) — non-fatal */ }
  return next
}

/** True when the user has consumed all free guest uses. */
export function hasReachedGuestLimit(): boolean {
  return getGuestUses() >= GUEST_LIMIT
}

/** Call on sign-in so returning users don't immediately hit the gate. */
export function clearGuestUses(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch { /* ignore */ }
}
