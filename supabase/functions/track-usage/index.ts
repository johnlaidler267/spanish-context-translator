/**
 * Edge Function: track-usage
 *
 * POST /functions/v1/track-usage
 *
 * Atomically increments one or more usage counters for the authenticated user,
 * then returns the full current-period snapshot and whether each limit-checked
 * metric is still within the user's tier allowance.
 *
 * Body:
 *   increments  Record<UsageMetric, number>  — metrics to increment (omit = 0)
 *   checkOnly?  boolean                      — if true, read counters without incrementing
 *
 * Response 200:
 * {
 *   allowed:  boolean                        — false if ANY limit-checked metric is exceeded
 *   counters: Record<UsageMetric, number>    — post-increment values for the current period
 *   limits:   Record<UsageMetric, number | null>  — tier cap (null = unlimited)
 *   exceeded: UsageMetric[]                  — which metrics are over their limit (empty = fine)
 *   period: { start: string, end: string }   — ISO 8601 billing period dates
 * }
 *
 * Response 4xx/5xx:  { error: string }
 *
 * Environment variables:
 *   SUPABASE_URL              — injected automatically
 *   SUPABASE_ANON_KEY         — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 */

import { createClient } from "npm:@supabase/supabase-js@2"
import {
  corsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/cors.ts"
import { getTierLimits, type TierId } from "../_shared/tiers.ts"
import {
  METRIC_CONFIG,
  metricsToRpcParams,
  readCounter,
  type UsageMetric,
} from "../_shared/usage-metrics.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  increments?: Partial<Record<UsageMetric, number>>
  checkOnly?: boolean
}

interface SubscriptionRow {
  id: string
  plan_id: TierId
  current_period_start: string | null
  current_period_end: string | null
  status: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
function err(message: string, status = 400) { return json({ error: message }, status) }

/**
 * Derive billing period boundaries for the current request.
 * Priority: subscription period → calendar month fallback (for free/no-sub users).
 */
function resolvePeriod(sub: SubscriptionRow | null): { start: Date; end: Date } {
  if (sub?.current_period_start && sub?.current_period_end) {
    return {
      start: new Date(sub.current_period_start),
      end:   new Date(sub.current_period_end),
    }
  }

  // Calendar-month fallback
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  return { start, end }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST")    return err("Method not allowed", 405)

  // ── Environment ────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return err("Supabase environment is not configured", 500)
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return err("Missing or malformed Authorization header", 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return err("Invalid or expired token", 401)

  const db = createClient(supabaseUrl, serviceKey)

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: RequestBody = {}
  try { body = await req.json() } catch { /* empty body = check-only */ }

  const increments = body.increments ?? {}
  const checkOnly  = body.checkOnly ?? false

  // ── Subscription + period ──────────────────────────────────────────────────
  let { data: sub } = await db
    .from("user_subscriptions")
    .select("id, plan_id, current_period_start, current_period_end, status")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle<SubscriptionRow>()

  // Lazy-provision: the on_auth_user_created trigger should have already created
  // this row, but as a safety net we call provision_free_tier and re-fetch.
  // This handles users who signed up before migration 0005, and edge cases where
  // the trigger ran before the user row was fully committed.
  if (!sub) {
    await db.rpc("provision_free_tier", { p_user_id: user.id }).catch((e) => {
      console.warn("[track-usage] provision_free_tier failed (may already exist):", e)
    })
    const { data: reSub } = await db
      .from("user_subscriptions")
      .select("id, plan_id, current_period_start, current_period_end, status")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .maybeSingle<SubscriptionRow>()
    sub = reSub
  }

  // Only grant paid-tier limits when the subscription is in an access-granting state.
  // Canceled, expired, past_due, and paused subscribers fall back to free limits.
  const ACCESS_STATUSES = new Set(["active", "trialing"])
  const tierId: TierId = (sub && ACCESS_STATUSES.has(sub.status))
    ? sub.plan_id
    : "free"
  const limits = getTierLimits(tierId)
  const period = resolvePeriod(sub)

  // ── Pre-flight limit check (before incrementing) ──────────────────────────
  // Read current counters so we can check whether the increment would breach a limit.
  // We read the row first, then increment atomically — the RPC does both in one
  // statement (INSERT … ON CONFLICT DO UPDATE … RETURNING), so the returned row
  // already reflects the new values. We use the returned row for the response.
  //
  // For check-only requests we skip the RPC entirely.

  let usageRow: Record<string, unknown> | null = null

  if (!checkOnly && sub && Object.keys(increments).length > 0) {
    // ── Atomic increment via RPC ──────────────────────────────────────────
    const rpcParams = metricsToRpcParams(increments)

    const { data: rpcRow, error: rpcError } = await db.rpc("increment_usage", {
      p_user_id:         user.id,
      p_subscription_id: sub.id,
      p_period_start:    period.start.toISOString(),
      p_period_end:      period.end.toISOString(),
      ...rpcParams,
      p_extras:          rpcParams.p_extras,
    })

    if (rpcError) {
      console.error("[track-usage] RPC error:", rpcError)
      return err("Failed to record usage", 500)
    }

    usageRow = rpcRow as Record<string, unknown>
  } else {
    // Check-only or no increments — just read current state
    if (sub) {
      const { data: readRow } = await db.rpc("get_current_usage", {
        p_subscription_id: sub.id,
        p_period_start:    period.start.toISOString(),
      })
      usageRow = (readRow as Record<string, unknown> | null) ?? null
    }
  }

  // ── Build counters snapshot ────────────────────────────────────────────────
  const allMetrics = Object.keys(METRIC_CONFIG) as UsageMetric[]

  const counters = Object.fromEntries(
    allMetrics.map(m => [m, usageRow ? readCounter(usageRow, m) : 0])
  ) as Record<UsageMetric, number>

  const limitMap = Object.fromEntries(
    allMetrics.map(m => {
      const key = METRIC_CONFIG[m].limitKey
      const cap  = key ? limits[key] : null
      return [m, cap]
    })
  ) as Record<UsageMetric, number | null>

  // ── Determine which metrics are exceeded ──────────────────────────────────
  const exceeded: UsageMetric[] = allMetrics.filter(m => {
    const cap = limitMap[m]
    return cap !== null && counters[m] > cap
  })

  return json({
    allowed:  exceeded.length === 0,
    counters,
    limits:   limitMap,
    exceeded,
    period: {
      start: period.start.toISOString(),
      end:   period.end.toISOString(),
    },
  })
})
