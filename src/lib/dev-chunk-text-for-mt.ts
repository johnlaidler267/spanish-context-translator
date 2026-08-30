/** Split long article page source for third-party MT POST limits (dev tooling). */
export function devChunkTextForMachineTranslate(text: string, maxLen: number): string[] {
  const t = text.replace(/\r\n/g, "\n").trim()
  if (!t) return []
  if (t.length <= maxLen) return [t]
  const out: string[] = []
  let i = 0
  while (i < t.length) {
    let end = Math.min(i + maxLen, t.length)
    if (end < t.length) {
      const slice = t.slice(i, end)
      const relPara = slice.lastIndexOf("\n\n")
      const relSpace = slice.lastIndexOf(" ")
      const preferPara = relPara >= 40 ? i + relPara + 2 : -1
      const preferSpace = relSpace >= Math.floor(maxLen * 0.35) ? i + relSpace + 1 : -1
      const cut = Math.max(preferPara, preferSpace)
      if (cut > i) end = cut
    }
    const piece = t.slice(i, end).trim()
    if (piece) out.push(piece)
    i = end
  }
  return out
}
