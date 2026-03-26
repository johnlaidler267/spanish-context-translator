/**
 * Server-side limit enforcement middleware.
 *
 * Drop this into any Edge Function as a one-liner pre-flight check:
 *
 *   import { enforceLimits } from "../_shared/enforce-limits.ts"
 *
 *   const decision = await enforceLimits({
 *     userId, db, endpoint: "process-text",
 *     checks: { texts_submitted: 1, chars_processed: text.length },
 *   })
 *   if (!decision.allowed) return decision.toResponse()
 *
 * The function:
 *   1. Fetches the user's active subscription (or uses the passed-in one).
 *   2. Reads current-period usage via get_current_usage RPC.
 *   3. Evaluates each checked metric against its tier limit (pre-increment).
 *   4. Classifies as clean / warning / blocked.
 *   5. Writes warned + blocked outcomes to enforcement_log.
 *   6. Returns an EnforcementDecision — caller decides how to respond.
 *
 * Grace thresholds (overridable per call):
 *   WARN_RATIO  = 0.80 — at 80 % of limit, flag as 'warning' (still allowed)
 *   BLOCK_RATIO = 1.00 — at 100 % of limit (pre-increment), reject as 'blocked'
 */

import { type SupabaseClient } from "npm:@supabase/supabase-js@2"
import {
  getTierLimits,
  type TierId,
  type TierLimits,
} from "./tiers.ts"
import {
  METRIC_CONFIG,
  readCounter,
  type UsageMetric,
} from "./usage-metrics.ts"
import { isWithinGracePeriod } from "./grace-period.ts"

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Start warning when usage reaches this fraction of the cap (0–1). */
export const WARN_RATIO  = 0.80
/** Hard block when current usage (pre-increment) reaches this fraction. */
export const BLOCK_RATIO = 1.00

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnforcementLevel = "clean" | "warning" | "blocked"

/** Logging verbosity passed to enforceLimits(). */
export type LogLevel =
  | "all"      // log every check outcome (high volume — use for debugging)
  | "warned"   // only log warning + blocked (default — good for analytics)
  | "blocked"  // only log hard blocks
  | "none"     // never write to enforcement_log

export interface MetricDecision {
  metric:      UsageMetric
  level:       EnforcementLevel
  current:     number           // current value (pre-increment)
  proposed:    number           // increment being requested
  limit:       number | null    // tier cap (null = unlimited)
  ratio:       number | null    // current / limit (null if unlimited)
  /** Ratio if the proposed increment is applied: (current + proposed) / limit */
  ratioAfter:  number | null
}

export interface EnforcementDecision {
  /** Aggregate outcome — worst level across all checked metrics. */
  level:    EnforcementLevel
  /** False when level === 'blocked'. */
  allowed:  boolean
  /** Metrics at or over 100 % (hard block triggers). */
  blocked:  UsageMetric[]
  /** Metrics at 80–99 % (still allowed, show warning). */
  warned:   UsageMetric[]
  /** Per-metric detail. */
  metrics:  MetricDecision[]
  /** Resolved tier. */
  tierId:   TierId
  /** Human-readable summary suitable for an API error body. */
  message:  string

  /**
   * Build a ready-to-return Response for blocked decisions.
   * Returns undefined when the decision is allowed — enforces the caller to check.
   */
  toResponse(): Response | undefined
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface SubscriptionContext {
  /** user_subscriptions.id */
  subscriptionId: string
  tierId:         TierId
  periodStart:    string         // ISO 8601
  periodEnd:      string         // ISO 8601
  /** Raw status from user_subscriptions.status */
  status:         string
  /** Set when status is past_due; used for grace-period calculation. */
  pastDueSince:   string | null
}

export interface EnforceLimitsOptions {
  userId:    string
  db:        SupabaseClient
  /** Which action is calling — stored in enforcement_log.endpoint. */
  endpoint:  string
  /**
   * Metrics to check and their proposed increments.
   * Only limit-checked metrics (METRIC_CONFIG[m].limitKey != null) are enforced.
   * Uncapped metrics (limitKey: null) are passed through without a check.
   */
  checks:    Partial<Record<UsageMetric, number>>
  /**
   * Pre-fetched subscription context. If omitted the middleware fetches it.
   * Pass this when the calling function has already queried user_subscriptions
   * to avoid a double round-trip.
   */
  subscription?: SubscriptionContext | null
  /** Grace thresholds (defaults: WARN_RATIO=0.80, BLOCK_RATIO=1.00). */
  warnRatio?:  number
  blockRatio?: number
  /** What to write to enforcement_log (default: "warned"). */
  logLevel?: LogLevel
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function enforceLimits(
  opts: EnforceLimitsOptions,
): Promise<EnforcementDecision> {
  const {
    userId,
    db,
    endpoint,
    checks,
    warnRatio  = WARN_RATIO,
    blockRatio = BLOCK_RATIO,
    logLevel   = "warned",
  } = opts

  // ── 1. Resolve subscription context ────────────────────────────────────────
  let sub = opts.subscription ?? null

  if (!sub) {
    const { data } = await db
      .from("user_subscriptions")
      .select("id, plan_id, current_period_start, current_period_end, status, past_due_since")
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle<{
        id:                   string
        plan_id:              TierId
        current_period_start: string | null
        current_period_end:   string | null
        status:               string
        past_due_since:       string | null
      }>()

    if (data?.current_period_start && data?.current_period_end) {
      sub = {
        subscriptionId: data.id,
        tierId:         data.plan_id,
        periodStart:    data.current_period_start,
        periodEnd:      data.current_period_end,
        status:         data.status,
        pastDueSince:   data.past_due_since,
      }
    }
  }

  // ── Resolve effective tier based on subscription status ──────────────────
  // • active / trialing             → paid-tier limits
  // • past_due within grace period  → paid-tier limits (don't punish immediately)
  // • past_due after grace expires  → free-tier limits
  // • canceled / incomplete_expired → free-tier limits
  // • no sub record                 → free-tier limits
  const ACCESS_STATUSES = new Set(["active", "trialing"])

  let tierId: TierId = "free"
  if (sub) {
    if (ACCESS_STATUSES.has(sub.status)) {
      tierId = sub.tierId
    } else if (sub.status === "past_due") {
      const withinGrace = sub.pastDueSince
        ? isWithinGracePeriod(sub.pastDueSince)
        : true  // no timestamp yet → treat conservatively as still within grace
      tierId = withinGrace ? sub.tierId : "free"
      if (!withinGrace) {
        console.warn(
          `[enforce-limits] user=${userId} past_due grace expired` +
          ` since=${sub.pastDueSince} — enforcing free-tier limits`,
        )
      }
    }
    // else: canceled, incomplete, etc. → stays "free"
  }

  const tierLimits: TierLimits = getTierLimits(tierId)

  // ── 2. Fetch current usage ────────────────────────────────────────────────
  let usageRow: Record<string, unknown> | null = null

  if (sub) {
    const { data } = await db.rpc("get_current_usage", {
      p_subscription_id: sub.subscriptionId,
      p_period_start:    sub.periodStart,
    })
    usageRow = (data as Record<string, unknown> | null) ?? null
  }

  // ── 3. Evaluate each metric ───────────────────────────────────────────────
  const metricDecisions: MetricDecision[] = []
  const blockedMetrics: UsageMetric[] = []
  const warnedMetrics:  UsageMetric[] = []

  for (const [metricKey, proposed] of Object.entries(checks) as [UsageMetric, number][]) {
    const cfg      = METRIC_CONFIG[metricKey]
    const limitKey = cfg?.limitKey ?? null
    const limit    = limitKey ? (tierLimits[limitKey] ?? null) : null

    // Uncapped metric — pass through without enforcement
    if (limit === null) {
      metricDecisions.push({
        metric: metricKey, level: "clean",
        current: 0, proposed: proposed ?? 0,
        limit: null, ratio: null, ratioAfter: null,
      })
      continue
    }

    const current    = usageRow ? readCounter(usageRow, metricKey) : 0
    const ratio      = limit > 0 ? current / limit : 1
    const ratioAfter = limit > 0 ? (current + (proposed ?? 0)) / limit : 1

    let level: EnforcementLevel
    if (ratio >= blockRatio) {
      level = "blocked"
      blockedMetrics.push(metricKey)
    } else if (ratio >= warnRatio || ratioAfter >= warnRatio) {
      level = "warning"
      warnedMetrics.push(metricKey)
    } else {
      level = "clean"
    }

    metricDecisions.push({
      metric: metricKey, level,
      current, proposed: proposed ?? 0,
      limit, ratio: +ratio.toFixed(4), ratioAfter: +ratioAfter.toFixed(4),
    })
  }

  // ── 4. Aggregate outcome ──────────────────────────────────────────────────
  const overallLevel: EnforcementLevel =
    blockedMetrics.length > 0 ? "blocked"
    : warnedMetrics.length > 0 ? "warning"
    : "clean"

  const allowed  = overallLevel !== "blocked"

  const message = buildMessage(overallLevel, blockedMetrics, warnedMetrics, tierId)

  // ── 5. Log to enforcement_log ─────────────────────────────────────────────
  const loggableDecisions = metricDecisions.filter(d => {
    if (logLevel === "none")    return false
    if (logLevel === "all")     return true
    if (logLevel === "blocked") return d.level === "blocked"
    // default "warned"
    return d.level === "warning" || d.level === "blocked"
  })

  if (loggableDecisions.length > 0) {
    const rows = loggableDecisions.map(d => ({
      user_id:      userId,
      endpoint,
      metric:       d.metric,
      level:        d.level,
      current_val:  d.current,
      proposed_inc: d.proposed,
      limit_val:    d.limit,
      tier_id:      tierId,
      fill_ratio:   d.ratio,
    }))

    // Fire-and-forget — never let logging failure block the response
    db.from("enforcement_log").insert(rows).then(({ error }) => {
      if (error) console.error("[enforce-limits] log insert failed:", error.message)
    })
  }

  // ── 6. Build decision ─────────────────────────────────────────────────────
  const decision: EnforcementDecision = {
    level:   overallLevel,
    allowed,
    blocked: blockedMetrics,
    warned:  warnedMetrics,
    metrics: metricDecisions,
    tierId,
    message,
    toResponse() {
      if (allowed) return undefined
      return new Response(
        JSON.stringify({
          error:   "limit_exceeded",
          message,
          blocked: blockedMetrics,
          tier:    tierId,
          upgrade: "/upgrade",
        }),
        {
          status:  402,
          headers: { "Content-Type": "application/json" },
        },
      )
    },
  }

  console.log(
    `[enforce-limits] endpoint=${endpoint} user=${userId}` +
    ` tier=${tierId} level=${overallLevel}` +
    (blockedMetrics.length ? ` blocked=[${blockedMetrics}]` : "") +
    (warnedMetrics.length  ? ` warned=[${warnedMetrics}]`  : ""),
  )

  return decision
}

// ─── Message builder ──────────────────────────────────────────────────────────

function buildMessage(
  level: EnforcementLevel,
  blocked: UsageMetric[],
  warned:  UsageMetric[],
  tierId:  TierId,
): string {
  const label = (m: UsageMetric) => METRIC_CONFIG[m]?.label ?? m

  if (level === "blocked") {
    const names = blocked.map(label).join(", ")
    return tierId === "free"
      ? `Free plan limit reached for: ${names}. Upgrade to continue.`
      : `Monthly limit reached for: ${names}. Upgrade or wait for your billing cycle to reset.`
  }
  if (level === "warning") {
    const names = warned.map(label).join(", ")
    return `Approaching limit for: ${names}. Consider upgrading your plan.`
  }
  return "OK"
}
