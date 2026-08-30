import { jsonrepair } from "jsonrepair"

/**
 * Balanced `[`…`]` span starting at `start` (must be `[`); ignores `]` inside double-quoted JSON strings.
 */
function sliceBalancedJsonArrayFrom(raw: string, start: number): string | null {
  if (start < 0 || start >= raw.length || raw[start] !== "[") return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]!
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (c === "\\") {
        esc = true
        continue
      }
      if (c === '"') {
        inStr = false
        continue
      }
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === "[") depth++
    if (c === "]") {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

/** First `[`…`]` span in `raw`. */
function sliceBalancedJsonArray(raw: string): string | null {
  const start = raw.indexOf("[")
  if (start === -1) return null
  return sliceBalancedJsonArrayFrom(raw, start)
}

/** Every balanced array span (for models that prepend chain-of-thought before the real JSON). */
function allBalancedJsonArraySpans(raw: string): string[] {
  const spans: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "[") {
      const s = sliceBalancedJsonArrayFrom(raw, i)
      if (s) spans.push(s)
    }
  }
  return spans
}

/**
 * Model sometimes appends prose after the closing `]` (e.g. "Need chunking. Provide JSON array.").
 * Slice to that bracket so JSON.parse / jsonrepair see only the array.
 */
function stripTrailingChunkingBoilerplate(s: string): string {
  const t = s.trimEnd()
  const re =
    /\]\s*(?:\r?\n\s*)*(?:Need chunking|Provide\s+(?:JSON\s+)?array)[\s\S]*$/i
  const m = t.match(re)
  if (m && m.index !== undefined) return t.slice(0, m.index + 1)
  return t
}

/** First complete `[...]` only — drops trailing "Need chunking…" after a valid array. */
function stripToFirstBalancedJsonArray(raw: string): string | null {
  const t = raw.trim()
  const start = t.indexOf("[")
  if (start === -1) return null
  return sliceBalancedJsonArrayFrom(t, start)
}

/**
 * GPT-OSS often glues `,":"` where valid JSON needs `":","` when the Spanish chunk is
 * punctuation (comma, colon). Example broken: `{"c",":"m` → `{"c":",","m`
 * Without this, `]`/`"` balance is wrong and JSON.parse + jsonrepair both fail.
 */
function sanitizeChunkJsonTypos(s: string): string {
  let o = s
  for (let pass = 0; pass < 6; pass++) {
    const next = o
      .replace(/"c",":"m/g, '"c":",","m')
      .replace(/"c",":"l/g, '"c":",","l')
      .replace(/"c",":"n/g, '"c":",","n')
      .replace(/"c",",","m/g, '"c":",","m')
      .replace(/"c",",","l/g, '"c":",","l')
      .replace(/"c",",","n/g, '"c":",","n')
      .replace(/"l":":"(?=\s*[,}\]])/g, '"l":","')
      .replace(/"m":":"(?=\s*[,}\]])/g, '"m":","')
    if (next === o) break
    o = next
  }
  return o
}

function looksLikeChunkJsonKeys(s: string): boolean {
  return /"c"\s*:/.test(s) || /"chunk"\s*:/.test(s)
}

export function extractChunkJsonArrayFromText(raw: string): unknown[] {
  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim()
  cleaned = stripTrailingChunkingBoilerplate(cleaned)
  cleaned = sanitizeChunkJsonTypos(cleaned)
  if (!cleaned) throw new Error("Empty model response")

  const tryParseArray = (s: string): unknown[] | null => {
    const t = sanitizeChunkJsonTypos(stripTrailingChunkingBoilerplate(s.trim()))
    if (!t) return null
    try {
      const repaired = jsonrepair(t)
      const parsed = JSON.parse(repaired)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      try {
        const parsed = JSON.parse(t)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
  }

  /**
   * jsonrepair on `[...] trailing prose` can yield `[]` or junk; whole-string parse must not
   * win before we isolate the first balanced `[...]` (which ignores text after `]`).
   */
  const acceptWholeArray = (arr: unknown[] | null, source: string): unknown[] | null => {
    if (!arr) return null
    if (arr.length > 0) return arr
    const t = source.trim()
    if (/^\[\s*\]\s*$/.test(t)) return arr
    if (looksLikeChunkJsonKeys(source)) return null
    return arr
  }

  // 1) First top-level [...] only (drops any trailing model text after `]`)
  const stripped = stripToFirstBalancedJsonArray(cleaned)
  if (stripped) {
    const arr = acceptWholeArray(tryParseArray(stripped), stripped)
    if (arr) return arr
  }

  // 2) Whole string is a JSON array (possibly with jsonrepair) — reject empty if chunks clearly present
  const whole = acceptWholeArray(tryParseArray(cleaned), cleaned)
  if (whole) return whole

  // 3) Try every balanced span, longest first (prose before first [, or bracket scanner quirks)
  const candidates = allBalancedJsonArraySpans(cleaned).sort((a, b) => b.length - a.length)
  for (const span of candidates) {
    const arr = acceptWholeArray(tryParseArray(span), span)
    if (arr && arr.length > 0) return arr
  }

  // 4) First [ … ] via indexOf
  const balanced = sliceBalancedJsonArray(cleaned)
  if (balanced) {
    const arr = acceptWholeArray(tryParseArray(balanced), balanced)
    if (arr) return arr
  }

  // 5) Greedy bracket span (last resort; can fail if `]` appears inside strings)
  const greedy = cleaned.match(/\[[\s\S]*\]/)
  if (greedy) {
    const arr = acceptWholeArray(tryParseArray(greedy[0]), greedy[0])
    if (arr) return arr
  }

  try {
    const repaired = jsonrepair(cleaned)
    const parsed = JSON.parse(repaired) as unknown
    if (Array.isArray(parsed)) {
      const ok = acceptWholeArray(parsed, cleaned)
      if (ok) return ok
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>
      for (const k of ["chunks", "output", "data", "items", "result"]) {
        const v = o[k]
        if (Array.isArray(v)) return v
      }
    }
  } catch {
    /* ignore */
  }

  const preview = cleaned.length > 400 ? `${cleaned.slice(0, 400)}…` : cleaned
  throw new Error(`No JSON array found in response. Preview: ${preview}`)
}
