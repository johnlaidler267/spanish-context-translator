export const DISPLAY_NAME_STORAGE_KEY = "lector-display-name"
const DISPLAY_NAME_MAX_LENGTH = 40

export function sanitizeDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, DISPLAY_NAME_MAX_LENGTH)
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
