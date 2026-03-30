/**
 * Usage tracking service — frontend layer.
 *
 * Wraps the track-usage Edge Function with:
 *   • Optimistic local state (UI updates instantly, rolls back on server rejection)
 *   • Per-metric limit status helpers
 *   • React-friendly: use UsageTracker as a stable class instance held in a ref
 *
 * KEEP IN SYNC with supabase/functions/_shared/usage-metrics.ts.
 *
 * HOW TO ADD A NEW METRIC
 * ───────────────────────
 * 1. Add it to UsageMetric below.
 * 2. Add its entry to METRIC_CONFIG.
 * 3. Mirror the same change in _shared/usage-metrics.ts (server side).
 * 4. Done — no other files need changing.
 */

import { supabase } from "@/lib/supabase"
import type { TierId } from "@/lib/tiers"
import { getLimit, type TierLimits } from "@/lib/tiers"

// ─── Metric definitions ───────────────────────────────────────────────────────

export type UsageMetric =
  | "texts_submitted"       // monthly counter
  | "texts_submitted_today" // read-only daily counter (auto-reset by RPC)
  | "chunks_returned"
  | "pages_processed"
  | "chars_processed"
  | "api_calls"
  | "voice_requests"
  // ↓ Add new metrics here (mirror in _shared/usage-metrics.ts)
  // | "exports_created"

interface MetricConfig {
  /** Human-readable label for display in UI. */
  label: string
  /** Which TierLimits key caps this metric (null = not limit-checked). */
  limitKey: keyof TierLimits | null
}

export const METRIC_CONFIG: Record<UsageMetric, MetricConfig> = {
  texts_submitted:       { label: "Texts submitted",       limitKey: "textsPerMonth" },
  texts_submitted_today: { label: "Texts submitted today", limitKey: "textsPerDay"   },
  chunks_returned:       { label: "Chunks returned",       limitKey: "chunksPerRequest"   },
  pages_processed:       { label: "Pages processed",       limitKey: "pagesPerSubmission" },
  chars_processed:       { label: "Characters processed",  limitKey: "charsPerSubmission" },
  api_calls:             { label: "API calls",             limitKey: null                 },
  voice_requests:        { label: "Voice requests",        limitKey: null                 },
}

export const ALL_METRICS = Object.keys(METRIC_CONFIG) as UsageMetric[]

// ─── Response types ───────────────────────────────────────────────────────────

export type UsageCounters = Record<UsageMetric, number>
export type UsageLimits   = Record<UsageMetric, number | null>

export interface TrackResult {
  /** False when at least one limit-checked metric exceeded its cap. */
  allowed: boolean
  /** Post-increment counter values for the current billing period. */
  counters: UsageCounters
  /** Tier caps per metric (null = unlimited). */
  limits: UsageLimits
  /** Which metrics are over their cap. Empty array = all fine. */
  exceeded: UsageMetric[]
  /** Current billing period boundaries. */
  period: { start: string; end: string }
}

export class UsageError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = "UsageError"
  }
}

// ─── Per-metric limit status (for UI) ────────────────────────────────────────

export interface LimitStatus {
  current: number
  limit:   number | null   // null = unlimited
  /** 0–1 fill ratio, or null if unlimited. */
  ratio:   number | null
  /** True when current >= limit (hard block). */
  exceeded: boolean
  /** True when current >= 80% of limit (show warning). */
  nearLimit: boolean
}

export function getLimitStatus(
  metric: UsageMetric,
  counters: UsageCounters,
  limits: UsageLimits,
): LimitStatus {
  const current = counters[metric] ?? 0
  const limit   = limits[metric]   ?? null

  if (limit === null) {
    return { current, limit: null, ratio: null, exceeded: false, nearLimit: false }
  }

  const ratio     = limit > 0 ? current / limit : 1
  return {
    current,
    limit,
    ratio,
    exceeded:  current >= limit,
    nearLimit: ratio >= 0.8,
  }
}

// ─── Core API call ─────────────────────────────────────────────────────────────

const FUNCTION_NAME = "track-usage"

async function callTrackUsage(
  increments: Partial<UsageCounters>,
  checkOnly = false,
): Promise<TrackResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new UsageError("Not authenticated", 401)

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ increments, checkOnly }),
  })

  let payload: Partial<TrackResult> & { error?: string }
  try { payload = await res.json() } catch {
    throw new UsageError(`Server error (HTTP ${res.status})`, res.status)
  }

  if (!res.ok || payload.error) {
    throw new UsageError(payload.error ?? `HTTP ${res.status}`, res.status)
  }

  return payload as TrackResult
}

// ─── UsageTracker class ───────────────────────────────────────────────────────

/**
 * Stateful usage tracker with optimistic local increments.
 *
 * Typical usage in a React component:
 *
 *   const trackerRef = useRef(new UsageTracker())
 *   const tracker    = trackerRef.current
 *
 *   // On app mount — seed counters from the server
 *   useEffect(() => { tracker.refresh() }, [])
 *
 *   // Before translating
 *   const result = await tracker.track({ texts_submitted: 1, chars_processed: text.length })
 *   if (!result.allowed) { showLimitModal(result.exceeded); return }
 *
 *   // To display "3 of 5 texts used":
 *   const status = tracker.getLimitStatus("texts_submitted")
 */
export class UsageTracker {
  private _counters: UsageCounters = zeroCounters()
  private _limits:   UsageLimits   = nullLimits()
  private _period:   TrackResult["period"] | null = null
  private _tierId:   TierId | null = null

  /** Listeners notified after every server sync. */
  private _listeners: Set<() => void> = new Set()

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  private _notify() { this._listeners.forEach(fn => fn()) }

  // ── Getters ────────────────────────────────────────────────────────────────

  get counters(): UsageCounters { return { ...this._counters } }
  get limits():   UsageLimits   { return { ...this._limits   } }
  get period():   TrackResult["period"] | null { return this._period }

  getLimitStatus(metric: UsageMetric): LimitStatus {
    return getLimitStatus(metric, this._counters, this._limits)
  }

  isExceeded(metric: UsageMetric): boolean {
    return this.getLimitStatus(metric).exceeded
  }

  isNearLimit(metric: UsageMetric): boolean {
    return this.getLimitStatus(metric).nearLimit
  }

  // ── Core operations ────────────────────────────────────────────────────────

  /**
   * Increment counters, sync with the server, and return the authoritative result.
   *
   * Optimistic flow:
   *   1. Apply increment locally immediately (zero latency for UI).
   *   2. Send to server (atomic DB increment + limit check).
   *   3. Replace local state with server-authoritative values.
   *   4. If the request fails entirely, roll back the optimistic increment.
   *
   * If the server returns allowed=false the increments ARE committed to the DB
   * (so counters reflect true usage), but the caller is told to block the action.
   */
  async track(increments: Partial<UsageCounters>): Promise<TrackResult> {
    // 1. Optimistic increment
    this._applyLocally(increments)
    this._notify()

    try {
      // 2. Server sync
      const result = await callTrackUsage(increments)

      // 3. Replace with authoritative state
      this._counters = result.counters
      this._limits   = result.limits
      this._period   = result.period
      this._notify()

      return result
    } catch (e) {
      // 4. Roll back optimistic increment on network/server failure
      this._applyLocally(increments, /* negate */ true)
      this._notify()
      throw e
    }
  }

  /**
   * Fetch current counters from the server without incrementing anything.
   * Call on mount to seed local state.
   */
  async refresh(): Promise<TrackResult> {
    const result = await callTrackUsage({}, /* checkOnly */ true)
    this._counters = result.counters
    this._limits   = result.limits
    this._period   = result.period
    this._notify()
    return result
  }

  /**
   * Seed the tracker from a known tier without a network call.
   * Useful when you already know the user's plan and just need limit display.
   */
  seedLimitsFromTier(tierId: TierId): void {
    this._tierId = tierId
    for (const metric of ALL_METRICS) {
      const key = METRIC_CONFIG[metric].limitKey
      this._limits[metric] = key ? getLimit(tierId, key) : null
    }
    this._notify()
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _applyLocally(
    increments: Partial<UsageCounters>,
    negate = false,
  ): void {
    const sign = negate ? -1 : 1
    for (const [metric, amount] of Object.entries(increments) as [UsageMetric, number][]) {
      if (!amount) continue
      this._counters[metric] = Math.max(0, (this._counters[metric] ?? 0) + sign * amount)
    }
  }
}

// ─── Standalone helpers (no class needed) ────────────────────────────────────

/**
 * One-shot: track metrics and get back the result.
 * Use when you don't need persistent local state.
 */
export async function trackUsage(
  increments: Partial<UsageCounters>,
): Promise<TrackResult> {
  return callTrackUsage(increments)
}

/**
 * One-shot: read current usage without incrementing.
 */
export async function fetchCurrentUsage(): Promise<TrackResult> {
  return callTrackUsage({}, true)
}

/** Fired after a successful `trackUsage` so billing/settings UI can refetch. */
export const USAGE_UPDATED_EVENT = "lectora:usage-updated"

export function broadcastUsageUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(USAGE_UPDATED_EVENT))
}

// ─── Zero values ─────────────────────────────────────────────────────────────

function zeroCounters(): UsageCounters {
  return Object.fromEntries(ALL_METRICS.map(m => [m, 0])) as UsageCounters
}

function nullLimits(): UsageLimits {
  return Object.fromEntries(ALL_METRICS.map(m => [m, null])) as UsageLimits
}
