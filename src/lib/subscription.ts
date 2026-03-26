/**
 * Frontend service for subscription lifecycle management.
 *
 * Wraps the manage-subscription edge function and provides typed helpers
 * for cancel, reactivate, and downgrade flows.
 *
 * Also exports `diffTiers()` — a pure helper that computes what a user
 * will lose when changing from one tier to another (used by the
 * confirmation dialog).
 *
 * Usage:
 *   import { cancelSubscription, reactivateSubscription, diffTiers } from "@/lib/subscription"
 *
 *   // Cancel at period end
 *   const result = await cancelSubscription()
 *
 *   // Undo a pending cancellation
 *   await reactivateSubscription()
 *
 *   // Downgrade (lower paid tier)
 *   await downgradeSubscription("price_REPLACE_PRO_MONTHLY")
 *
 *   // What will the user lose?
 *   const diff = diffTiers("unlimited", "pro")
 */

import { supabase } from "@/lib/supabase"
import {
  type TierId,
  type TierConfig,
  TIER_IDS,
  getTier,
} from "@/lib/tiers"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Simplified subscription status used by SubscriptionContext.
 *
 * "active"   — paid tier in good standing, or trialing
 * "free"     — on the free plan (no Stripe subscription)
 * "past_due" — payment failed, within grace period
 * "lapsed"   — canceled, past grace period, or otherwise restricted;
 *              triggers the upgrade popup
 */
export type SubscriptionStatus = "active" | "trialing" | "free" | "past_due" | "lapsed"

const GRACE_DAYS = 3

function isWithinGracePeriod(pastDueSince: string): boolean {
  const deadline = new Date(pastDueSince).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000
  return Date.now() < deadline
}

/**
 * Fetches the current user's subscription and maps it to a simplified
 * SubscriptionStatus value. Defaults to "free" on any error.
 */
export async function checkSubscriptionStatus(): Promise<{ status: SubscriptionStatus }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: "free" }

    const { data } = await supabase
      .from("user_subscriptions")
      .select("status, plan_id, past_due_since")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .maybeSingle<{ status: string; plan_id: string; past_due_since: string | null }>()

    if (!data) return { status: "free" }

    const { status, plan_id, past_due_since } = data

    if (status === "active")   return { status: plan_id === "free" ? "free" : "active" }
    if (status === "trialing") return { status: "trialing" }
    if (status === "past_due") {
      const withinGrace = past_due_since ? isWithinGracePeriod(past_due_since) : true
      return { status: withinGrace ? "past_due" : "lapsed" }
    }
    // canceled, incomplete_expired, unpaid, etc.
    return { status: plan_id === "free" ? "free" : "lapsed" }
  } catch {
    return { status: "free" }
  }
}

export class SubscriptionError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "SubscriptionError"
  }
}

/** Shape returned by the manage-subscription edge function on success. */
export interface ManageSubResult {
  cancelAtPeriodEnd: boolean
  status: string
  currentPeriodEnd: string | null
  planId: TierId
}

// ─── Core caller ──────────────────────────────────────────────────────────────

const FUNCTION_NAME = "manage-subscription"

async function callManageSubscription(
  body: {
    action: "cancel" | "reactivate" | "downgrade"
    targetPriceId?: string
    prorationBehavior?: "create_prorations" | "none"
  },
): Promise<ManageSubResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new SubscriptionError("You must be signed in.", "not_authenticated", 401)

  const functionUrl =
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })

  let payload: {
    ok?: boolean
    error?: string
    code?: string
    cancelAtPeriodEnd?: boolean
    status?: string
    currentPeriodEnd?: string | null
    planId?: string
  }
  try {
    payload = await res.json()
  } catch {
    throw new SubscriptionError(`Server error (HTTP ${res.status})`, "parse_error", res.status)
  }

  if (!res.ok || payload.error) {
    throw new SubscriptionError(
      payload.error ?? `Unexpected error (HTTP ${res.status})`,
      payload.code,
      res.status,
    )
  }

  return {
    cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? false,
    status:            payload.status ?? "active",
    currentPeriodEnd:  payload.currentPeriodEnd ?? null,
    planId:            (payload.planId as TierId) ?? "free",
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Schedule subscription cancellation at the end of the current billing period.
 * The user retains full access until `result.currentPeriodEnd`.
 * Can be undone with `reactivateSubscription()` before that date.
 */
export async function cancelSubscription(): Promise<ManageSubResult> {
  return callManageSubscription({ action: "cancel" })
}

/**
 * Cancel a pending end-of-period cancellation, restoring auto-renewal.
 * Only valid while `cancelAtPeriodEnd` is true.
 */
export async function reactivateSubscription(): Promise<ManageSubResult> {
  return callManageSubscription({ action: "reactivate" })
}

/**
 * Downgrade to a lower-tier paid plan immediately.
 * Stripe generates proration line items so the user receives credit for
 * unused time on the old plan.
 *
 * @param targetPriceId  Stripe Price ID from tiers.ts (must be a lower tier)
 * @param proration      "create_prorations" (default) | "none"
 */
export async function downgradeSubscription(
  targetPriceId: string,
  proration: "create_prorations" | "none" = "create_prorations",
): Promise<ManageSubResult> {
  return callManageSubscription({
    action: "downgrade",
    targetPriceId,
    prorationBehavior: proration,
  })
}

// ─── Tier diff helper ─────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<keyof TierConfig["features"], string> = {
  articleMode:        "Article mode",
  readMode:           "Read mode",
  voiceInput:         "Voice input",
  exportTranslations: "Export translations",
  apiAccess:          "API access",
  prioritySupport:    "Priority support",
  dedicatedSupport:   "Dedicated support",
}

export interface LimitChange {
  label: string
  from: string
  to:   string
}

export interface TierDiff {
  /** Feature flags that go from enabled → disabled. */
  lostFeatures: string[]
  /** Numeric limits that become more restrictive (or appear for the first time). */
  tighterLimits: LimitChange[]
}

function formatLimit(value: number | null, suffix: string): string {
  return value === null ? `Unlimited ${suffix}` : `${value.toLocaleString()} ${suffix}`
}

/**
 * Compute what a user loses when moving from `fromId` to `toId`.
 * Returns empty arrays if there are no regressions (e.g. for an upgrade).
 */
export function diffTiers(fromId: TierId, toId: TierId): TierDiff {
  const from = getTier(fromId)
  const to   = getTier(toId)

  const lostFeatures: string[] = []

  for (const key of Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>) {
    if (from.features[key] && !to.features[key]) {
      lostFeatures.push(FEATURE_LABELS[key])
    }
  }

  const tighterLimits: LimitChange[] = []

  const limitMeta: Array<{ key: keyof TierConfig["limits"]; suffix: string }> = [
    { key: "textsPerMonth",     suffix: "texts/month" },
    { key: "chunksPerRequest",  suffix: "chunks/request" },
    { key: "pagesPerSubmission",suffix: "pages/submission" },
    { key: "charsPerSubmission",suffix: "chars/submission" },
    { key: "savedTranslations", suffix: "saved translations" },
  ]

  for (const { key, suffix } of limitMeta) {
    const fromVal = from.limits[key]
    const toVal   = to.limits[key]

    // Gets more restrictive: null → number, or smaller number
    const getsWorse =
      (fromVal === null && toVal !== null) ||
      (fromVal !== null && toVal !== null && toVal < fromVal)

    if (getsWorse) {
      tighterLimits.push({
        label: suffix.replace("/", " per ").replace("-", " "),
        from:  formatLimit(fromVal, suffix),
        to:    formatLimit(toVal, suffix),
      })
    }
  }

  return { lostFeatures, tighterLimits }
}

/** Returns the ordered list of tier IDs that are strictly lower-rank than `fromId`. */
export function lowerTierIds(fromId: TierId): TierId[] {
  const rank: Record<TierId, number> = { free: 0, pro: 1, unlimited: 2 }
  return TIER_IDS.filter((id) => rank[id] < rank[fromId])
}
