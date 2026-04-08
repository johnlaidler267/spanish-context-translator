/**
 * Canonical metric definitions — Deno-compatible, shared across edge functions.
 * KEEP IN SYNC with src/lib/usage.ts (UsageMetric type + METRIC_CONFIG).
 *
 * HOW TO ADD A NEW METRIC
 * ───────────────────────
 * 1. Add it to UsageMetric below.
 * 2. Add its entry to METRIC_CONFIG.
 *    • If it maps to an existing DB column, set `column` to that column name.
 *    • If it's a new concept without a dedicated column, set `column: null`
 *      (it goes into extra_counters JSONB — no migration required).
 *    • Set `limitKey` to the TierLimits key it's capped by, or null if uncapped.
 * 3. Mirror the same change in src/lib/usage.ts.
 * 4. That's it. No other files need changing.
 *
 * To PROMOTE an extra_counters metric to its own column later:
 *   a. Write a migration adding the column + backfilling from extra_counters.
 *   b. Change `column` here from null to the new column name.
 */

import type { TierLimits } from "./tiers.ts"

// ─── Metric union ─────────────────────────────────────────────────────────────

/**
 * Every trackable action in the system.
 * Values are stable string keys — safe to store in logs / DB.
 */
export type UsageMetric =
  | "texts_submitted"       // user submits a text for translation (monthly counter)
  | "texts_submitted_today" // read-only: today's text-submission count (auto-reset daily)
  | "chunks_returned"       // total chunks the LLM returned in one response
  | "pages_processed"       // source-text pages sent to the LLM
  | "chars_processed"       // source characters sent to the LLM
  | "api_calls"             // raw LLM API round-trips
  | "voice_requests"        // voice-input transcription requests
  // ↓ Add new metrics here — set column: null if no dedicated DB column yet
  // | "exports_created"

// ─── Config ───────────────────────────────────────────────────────────────────

export interface MetricConfig {
  /**
   * Dedicated usage_records column name, or null to use extra_counters.
   * null = no migration required; uses the JSONB overflow bucket instead.
   */
  column: string | null
  /**
   * Which TierLimits key caps this metric (null = not limit-checked server-side).
   * Used by the edge function to decide whether to block the request.
   */
  limitKey: keyof TierLimits | null
  /** Human-readable label for logs / error messages. */
  label: string
}

export const METRIC_CONFIG: Record<UsageMetric, MetricConfig> = {
  texts_submitted: {
    column:   "texts_processed",
    limitKey: "textsPerMonth",
    label:    "texts submitted",
  },
  texts_submitted_today: {
    // Read-only metric: populated automatically by increment_usage (from p_texts).
    // Callers should never include this in `increments` — it is skipped by
    // metricsToRpcParams. The RPC resets texts_today when the date changes.
    column:   "texts_today",
    limitKey: "textsPerDay",
    label:    "texts submitted today",
  },
  chunks_returned: {
    column:   "chunks_returned",
    limitKey: "chunksPerRequest",
    label:    "chunks returned",
  },
  pages_processed: {
    column:   "pages_processed",
    limitKey: "pagesPerSubmission",
    label:    "pages processed",
  },
  chars_processed: {
    column:   "chars_processed",
    limitKey: "charsPerSubmission",
    label:    "characters processed",
  },
  api_calls: {
    column:   "api_calls",
    limitKey: null,
    label:    "API calls",
  },
  voice_requests: {
    column:   "voice_requests",
    limitKey: null,
    label:    "voice requests",
  },
}

/**
 * TierLimits keys like pagesPerSubmission / charsPerSubmission / chunksPerRequest
 * cap a *single* request, not the billing-period total. Compare against the
 * current increment only — not cumulative usage_records counters.
 */
export const PER_SUBMISSION_LIMIT_METRICS = new Set<UsageMetric>([
  "pages_processed",
  "chars_processed",
  "chunks_returned",
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map metric increments to the RPC parameters for fixed columns. */
export function metricsToRpcParams(
  increments: Partial<Record<UsageMetric, number>>,
): {
  p_texts:          number
  p_chunks:         number
  p_pages:          number
  p_chars:          number
  p_api_calls:      number
  p_voice_requests: number
  p_extras:         Record<string, number>
} {
  const params = {
    p_texts:          0,
    p_chunks:         0,
    p_pages:          0,
    p_chars:          0,
    p_api_calls:      0,
    p_voice_requests: 0,
    p_extras:         {} as Record<string, number>,
  }

  for (const [metric, amount] of Object.entries(increments) as [UsageMetric, number][]) {
    if (!amount || amount <= 0) continue
    const cfg = METRIC_CONFIG[metric]
    if (!cfg) continue

    switch (cfg.column) {
      case "texts_processed":  params.p_texts          += amount; break
      case "chunks_returned":  params.p_chunks         += amount; break
      case "pages_processed":  params.p_pages          += amount; break
      case "chars_processed":  params.p_chars          += amount; break
      case "api_calls":        params.p_api_calls      += amount; break
      case "voice_requests":   params.p_voice_requests += amount; break
      case "texts_today":
        // Read-only: the RPC maintains this automatically from p_texts.
        // Skip to prevent double-counting.
        break
      default:
        // No dedicated column → extra_counters JSONB
        params.p_extras[metric] = (params.p_extras[metric] ?? 0) + amount
    }
  }

  return params
}

/**
 * PostgREST / supabase-js can return one composite row as a one-element array.
 * Normalize both shapes to a plain object.
 */
export function normalizeUsageRpcRow(data: unknown): Record<string, unknown> | null {
  if (data == null) return null
  if (Array.isArray(data)) {
    const first = data[0]
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return first as Record<string, unknown>
    }
    return null
  }
  if (typeof data === "object") return data as Record<string, unknown>
  return null
}

/** YYYY-MM-DD in UTC; matches DB UTC-date logic. */
function utcCalendarTodayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Accept "YYYY-MM-DD" or ISO datetime, return date-only part. */
function isoDateOnly(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1] ?? null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return null
}

/** Read a counter value out of a usage_records row (handles both fixed + extra). */
export function readCounter(
  row: Record<string, unknown>,
  metric: UsageMetric,
): number {
  const cfg = METRIC_CONFIG[metric]

  if (cfg.column === "texts_today") {
    const stored = isoDateOnly(row["texts_today_date"])
    if (!stored) return 0
    const todayUtc = utcCalendarTodayIso()
    return stored === todayUtc ? ((row["texts_today"] as number) ?? 0) : 0
  }

  if (cfg.column) {
    return (row[cfg.column] as number) ?? 0
  }

  const extras = (row["extra_counters"] as Record<string, number> | null) ?? {}
  return extras[metric] ?? 0
}
