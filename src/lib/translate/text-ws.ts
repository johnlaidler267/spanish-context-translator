export function squashWsForReconcileCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

/** Collapse horizontal whitespace only; keep `\n` (verse, lyrics, pasted stanzas). */
export function collapseHorizontalWsOnly(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ").trim()
}
