/**
 * Canonical multi-word chunks: when the model splits these across 2–3 rows, we merge them
 * back to one chunk before reconcile. Match is case-insensitive on Spanish `c`.
 */

export type ChunkMergeSpec = { c: string; m: string; l: string; n?: string }

export const CHUNK_MERGES: ChunkMergeSpec[] = [
  { c: "al menos", m: "at least", l: "at least" },
  { c: "expresiones corporales", m: "body language", l: "bodily expressions" },
  { c: "en cambio", m: "on the other hand", l: "in change" },
  { c: "del mismo modo", m: "in the same way", l: "of the same mode" },
  { c: "los unos de los otros", m: "each other", l: "the ones from the others", n: "Fixed expression." },
  { c: "en gran medida", m: "largely", l: "in great measure", n: "Fixed expression." },
  { c: "redes sociales", m: "social media", l: "social networks" },
  { c: "hacer que", m: "make", l: "to make that", n: "Fixed expression." },
]

function normalizeForMatch(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase()
}

function rowSpanishC(row: Record<string, unknown>): string {
  const v = row.c !== undefined ? row.c : row.chunk
  if (v === null || v === undefined) return ""
  return typeof v === "string" ? v : String(v)
}

/**
 * Merge adjacent 2–3 raw LLM rows when their Spanish spans (joined with spaces) match
 * a `c` in {@link CHUNK_MERGES} (case-insensitive). Inserts the merge spec as one row.
 */
export function postProcessChunks(rows: unknown[]): unknown[] {
  if (!Array.isArray(rows)) return rows
  const out: unknown[] = []
  let i = 0
  while (i < rows.length) {
    const cur = rows[i]
    if (cur == null || typeof cur !== "object") {
      out.push(cur)
      i += 1
      continue
    }

    let replaced = false
    for (const len of [3, 2] as const) {
      if (i + len > rows.length) continue
      const window = rows.slice(i, i + len)
      if (!window.every((r) => r != null && typeof r === "object")) continue
      const joined = normalizeForMatch(
        window.map((r) => rowSpanishC(r as Record<string, unknown>)).join(" "),
      )
      if (!joined) continue

      for (const spec of CHUNK_MERGES) {
        if (normalizeForMatch(spec.c) !== joined) continue
        const merged: Record<string, string> = {
          c: spec.c,
          m: spec.m,
          l: spec.l,
        }
        if (spec.n !== undefined) merged.n = spec.n
        out.push(merged)
        i += len
        replaced = true
        break
      }
      if (replaced) break
    }

    if (!replaced) {
      out.push(rows[i])
      i += 1
    }
  }
  return out
}
