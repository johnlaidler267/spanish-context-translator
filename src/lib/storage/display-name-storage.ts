import type { User } from "@supabase/supabase-js"

export const DISPLAY_NAME_STORAGE_KEY = "lector-display-name"
/** Stored in Supabase Auth `user_metadata` via `updateUser({ data: { ... } })`. */
export const DISPLAY_NAME_META_KEY = "display_name"

const DISPLAY_NAME_MAX_LENGTH = 40

export function sanitizeDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, DISPLAY_NAME_MAX_LENGTH)
}

/**
 * Signed-in: use `user_metadata.display_name` when that key exists (including empty string after clear).
 * If the key was never set, fall back to localStorage so a pre-login name still shows until saved.
 * Signed-out: localStorage only.
 */
export function getEffectiveDisplayName(user: User | null): string {
  if (!user) return getStoredDisplayName()
  if (user.user_metadata == null) return getStoredDisplayName()
  const meta = user.user_metadata as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(meta, DISPLAY_NAME_META_KEY)) {
    return getStoredDisplayName()
  }
  const raw = meta[DISPLAY_NAME_META_KEY]
  return typeof raw === "string" ? sanitizeDisplayName(raw) : ""
}

export function getStoredDisplayName(): string {
  if (typeof window === "undefined") return ""
  try {
    const raw = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? ""
    return sanitizeDisplayName(raw)
  } catch {
    return ""
  }
}

export function setStoredDisplayName(value: string): string {
  const sanitized = sanitizeDisplayName(value)
  try {
    if (sanitized.length === 0) localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY)
    else localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, sanitized)
  } catch {
    /* ignore */
  }
  return sanitized
}
