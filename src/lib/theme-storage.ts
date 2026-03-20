import type { ReadingTheme } from "@/components/theme-toggle"

/** Key shared with inline script in index.html (avoid flash of wrong theme). */
export const READING_THEME_STORAGE_KEY = "lector-reading-theme"

export function getStoredReadingTheme(): ReadingTheme {
  if (typeof window === "undefined") return "light"
  try {
    const v = localStorage.getItem(READING_THEME_STORAGE_KEY)
    if (v === "dark" || v === "light") return v
  } catch {
    /* ignore */
  }
  return "light"
}

export function setStoredReadingTheme(theme: ReadingTheme): void {
  try {
    localStorage.setItem(READING_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}
