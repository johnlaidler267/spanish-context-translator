/**
 * Client-side limit enforcement guard.
 *
 * Uses the local UsageTracker state (no extra network call) to make instant
 * enforcement decisions before the user's action reaches the server.
 * The server always re-checks — this layer is for UX only.
 *
 * Three-level outcome:
 *   clean   — well under limit, proceed silently
 *   warning — approaching limit (≥80 %), proceed but show a nudge
 *   blocked — at/over limit, stop the action and show the upgrade modal
 *
 * Usage:
 *   const guard = useEnforcement()
 *
 *   const result = guard.check({ texts_submitted: 1, chars_processed: text.length })
 *   if (result.level === "blocked")  { showUpgradeModal(result); return }
 *   if (result.level === "warning")  { showLimitBanner(result) }
 *   // proceed with the action
 */

import { useState, useCallback, useRef } from "react"
import type { UsageMetric, UsageCounters, UsageLimits, LimitStatus, UsageTracker } from "@/lib/usage"
import {
  METRIC_CONFIG,
  ALL_METRICS,
  getLimitStatus,
  PER_SUBMISSION_LIMIT_METRICS,
} from "@/lib/usage"

// ─── Thresholds (mirror supabase/functions/_shared/enforce-limits.ts) ─────────

/** Warn when any checked metric's fill ratio reaches this value (0–1). */
export const WARN_RATIO  = 0.80
/** Hard block when any checked metric's fill ratio reaches this value. */
export const BLOCK_RATIO = 1.00

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnforcementLevel = "clean" | "warning" | "blocked"

export interface MetricGuardStatus extends LimitStatus {
  metric:   UsageMetric
  proposed: number          // the increment being evaluated
  /** Ratio after the proposed increment is applied. null if unlimited. */
  ratioAfter: number | null
  level: EnforcementLevel
}

export interface GuardResult {
  level:   EnforcementLevel
  /** False only when level === "blocked". */
  allowed: boolean
  /** Metrics at or over BLOCK_RATIO. */
  blocked: MetricGuardStatus[]
  /** Metrics between WARN_RATIO and BLOCK_RATIO. */
  warned:  MetricGuardStatus[]
  /** All evaluated metrics (including clean ones). */
  all:     MetricGuardStatus[]
  /**
   * Human-readable summary for the most severe issue.
   * Empty string when level === "clean".
   */
  message:  string
  /**
   * Short message for a dismissible banner.
   * e.g. "3 of 5 texts used — 2 remaining"
   */
  bannerText: string
}

// ─── Core check (stateless — takes counters + limits directly) ────────────────

/**
 * Pure enforcement check — no React, no network.
 * Pass counters + limits from any source (UsageTracker, API response, etc.).
 */
export function checkLimits(
  counters: UsageCounters,
  limits:   UsageLimits,
  increments: Partial<Record<UsageMetric, number>>,
  opts: { warnRatio?: number; blockRatio?: number } = {},
): GuardResult {
  const warnRatio  = opts.warnRatio  ?? WARN_RATIO
  const blockRatio = opts.blockRatio ?? BLOCK_RATIO

  const metrics: MetricGuardStatus[] = []
  const blocked:  MetricGuardStatus[] = []
  const warned:   MetricGuardStatus[] = []

  // Only evaluate metrics that have a limit key (skip uncapped ones)
  const checkedMetrics = (Object.keys(increments) as UsageMetric[]).filter(
    m => METRIC_CONFIG[m]?.limitKey !== null,
  )

  for (const metric of checkedMetrics) {
    const proposed = increments[metric] ?? 0
    const status   = getLimitStatus(metric, counters, limits)

    let ratioAfter: number | null = null
    let level: EnforcementLevel  = "clean"

    if (status.limit !== null) {
      if (PER_SUBMISSION_LIMIT_METRICS.has(metric)) {
        ratioAfter = status.limit > 0 ? proposed / status.limit : null
        if (proposed > status.limit) {
          level = "blocked"
        } else if (ratioAfter != null && ratioAfter >= warnRatio) {
          level = "warning"
        }
      } else {
        const currentRatio = status.ratio ?? 0
        ratioAfter = status.limit > 0
          ? (status.current + proposed) / status.limit
          : 1

        if (status.current + proposed > status.limit) {
          level = "blocked"
        } else if (currentRatio >= warnRatio || ratioAfter >= warnRatio) {
          level = "warning"
        }
      }
    }

    const entry: MetricGuardStatus = {
      ...status,
      metric,
      proposed,
      ratioAfter,
      level,
    }

    metrics.push(entry)
    if (level === "blocked") blocked.push(entry)
    else if (level === "warning") warned.push(entry)
  }

  const overallLevel: EnforcementLevel =
    blocked.length > 0 ? "blocked"
    : warned.length  > 0 ? "warning"
    : "clean"

  return {
    level:      overallLevel,
    allowed:    overallLevel !== "blocked",
    blocked,
    warned,
    all:        metrics,
    message:    buildMessage(overallLevel, blocked, warned),
    bannerText: buildBannerText(warned, blocked),
  }
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface EnforcementHook {
  /**
   * Instant check using cached tracker state.
   * Call this right before any user action.
   */
  check(increments: Partial<Record<UsageMetric, number>>): GuardResult

  /**
   * Run the check AND update internal banner state.
   * Same as check() but also sets the dismissible warning banner.
   */
  checkAndNotify(increments: Partial<Record<UsageMetric, number>>): GuardResult

  /** Current warning banner text (null when clean or dismissed). */
  bannerText: string | null

  /** Dismiss the warning banner. Resets on the next checkAndNotify call. */
  dismissBanner(): void

  /** Per-metric limit status snapshot from the tracker (for progress bars). */
  getMetricStatus(metric: UsageMetric): LimitStatus
}

/**
 * React hook — attach to a stable UsageTracker instance.
 *
 *   const trackerRef = useRef(new UsageTracker())
 *   const guard = useEnforcement(trackerRef.current)
 */
export function useEnforcement(tracker: UsageTracker): EnforcementHook {
  const [bannerText, setBannerText] = useState<string | null>(null)

  const check = useCallback(
    (increments: Partial<Record<UsageMetric, number>>): GuardResult => {
      return checkLimits(tracker.counters, tracker.limits, increments)
    },
    [tracker],
  )

  const checkAndNotify = useCallback(
    (increments: Partial<Record<UsageMetric, number>>): GuardResult => {
      const result = checkLimits(tracker.counters, tracker.limits, increments)
      if (result.level === "warning") setBannerText(result.bannerText || result.message)
      else if (result.level === "clean") setBannerText(null)
      // Don't clear banner for "blocked" — let the caller handle the modal
      return result
    },
    [tracker],
  )

  const dismissBanner = useCallback(() => setBannerText(null), [])

  const getMetricStatus = useCallback(
    (metric: UsageMetric): LimitStatus =>
      tracker.getLimitStatus(metric),
    [tracker],
  )

  return { check, checkAndNotify, bannerText, dismissBanner, getMetricStatus }
}

// ─── Message builders ─────────────────────────────────────────────────────────

function buildMessage(
  level: EnforcementLevel,
  blocked: MetricGuardStatus[],
  warned:  MetricGuardStatus[],
): string {
  if (level === "clean") return ""

  const label = (s: MetricGuardStatus) => METRIC_CONFIG[s.metric]?.label ?? s.metric

  if (level === "blocked") {
    const names = blocked.map(label).join(", ")
    return `Monthly limit reached for ${names}. Upgrade your plan to continue.`
  }

  // warning
  const parts = warned.map(s => {
    const remaining = s.limit !== null ? Math.max(0, s.limit - s.current) : null
    const label_ = label(s)
    return remaining !== null
      ? `${remaining} ${label_} remaining`
      : `approaching ${label_} limit`
  })
  return parts.join(" · ")
}

function buildBannerText(
  warned:  MetricGuardStatus[],
  blocked: MetricGuardStatus[],
): string {
  const all = [...blocked, ...warned]
  if (all.length === 0) return ""

  // Pick the most critical metric to feature in the banner
  const primary = all[0]
  const pct     = primary.ratio !== null ? Math.round(primary.ratio * 100) : null
  const name    = METRIC_CONFIG[primary.metric]?.label ?? primary.metric

  if (primary.level === "blocked") {
    return primary.limit !== null
      ? `${name} limit reached (${primary.current}/${primary.limit}). Upgrade to continue.`
      : `${name} limit reached. Upgrade to continue.`
  }

  return primary.limit !== null
    ? `${primary.current} of ${primary.limit} ${name} used this month${pct !== null ? ` (${pct}%)` : ""}.`
    : `Approaching ${name} limit.`
}

// ─── Typed error for blocked actions ─────────────────────────────────────────

export class LimitExceededError extends Error {
  constructor(
    public readonly result: GuardResult,
    message?: string,
  ) {
    super(message ?? result.message)
    this.name = "LimitExceededError"
  }
}

/**
 * Assert that an action is allowed. Throws LimitExceededError if blocked.
 * Use in async action handlers where you prefer exception flow over if-checks.
 *
 *   await assertAllowed(guard.check({ texts_submitted: 1 }))
 *   // proceed — guaranteed allowed below this line
 */
export function assertAllowed(result: GuardResult): void {
  if (!result.allowed) throw new LimitExceededError(result)
}
