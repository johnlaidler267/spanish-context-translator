/** Same-tab persistence: survives refresh; cleared when the tab/session ends. */
export const LANDING_DRAFT_STORAGE_KEY = "lector-landing-draft"

export function getStoredLandingDraft(): string {
  if (typeof window === "undefined") return ""
  try {
    return sessionStorage.getItem(LANDING_DRAFT_STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export function setStoredLandingDraft(text: string): void {
  try {
    if (text === "") sessionStorage.removeItem(LANDING_DRAFT_STORAGE_KEY)
    else sessionStorage.setItem(LANDING_DRAFT_STORAGE_KEY, text)
  } catch {
    /* quota / private mode */
  }
}
