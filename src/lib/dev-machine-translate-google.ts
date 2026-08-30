import { devChunkTextForMachineTranslate } from "@/lib/dev-chunk-text-for-mt"

/** ~2k keeps URLs under typical limits when encoded. */
const CHUNK_LEN = 1800

/**
 * Dev-only: Spanish → English via Google’s public `gtx` JSON endpoint, same origin + Vite proxy
 * (`/__gtx` → `translate.googleapis.com`) so the browser never hits CORS.
 */
export async function devMachineTranslatePageEsToEn(fullText: string): Promise<string> {
  const parts = devChunkTextForMachineTranslate(fullText.trim(), CHUNK_LEN)
  if (parts.length === 0) return ""
  const out: string[] = []
  for (const q of parts) {
    const path = `/__gtx/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(q)}`
    const res = await fetch(path)
    const rawText = await res.text()
    if (!res.ok) {
      throw new Error(
        `Translate HTTP ${res.status}: ${rawText.slice(0, 120)}${rawText.length > 120 ? "…" : ""}`,
      )
    }
    if (rawText.startsWith("<") || !rawText.trimStart().startsWith("[")) {
      throw new Error(
        "Dev proxy returned non-JSON (is `npm run dev` running and vite.config proxy `/__gtx` present?)",
      )
    }
    let data: unknown
    try {
      data = JSON.parse(rawText) as unknown
    } catch {
      throw new Error("Invalid JSON from translate proxy.")
    }
    const row0 = (data as { 0?: unknown })?.[0]
    if (!Array.isArray(row0)) {
      throw new Error("Unexpected translate response shape.")
    }
    const piece = row0
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
      .join("")
    if (!piece) throw new Error("Translation not found in response.")
    out.push(piece)
  }
  return out.join("\n\n")
}
