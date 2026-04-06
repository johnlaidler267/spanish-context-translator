import type { TierId } from "@/lib/tiers"
import { normalizeTierId } from "@/lib/tiers"

/** Minimal row shape — matches `user_subscriptions` fields used for plan pill / pricing UI. */
export type SubscriptionRowLike = {
  plan_id: string
  status: string
  trial_end: string | null
} | null

/**
 * True when the app shows the user as on the free tier (same rules as the header plan pill).
 * Paid / trialing / past_due (non-free plan) are false.
 */
export function subscriptionRowShowsAsFreePlan(row: SubscriptionRowLike): boolean {
  if (!row) return true
  if (row.status === "trialing" && row.plan_id !== "free") return false
  if (row.status === "active" && row.plan_id !== "free") return false
  if (row.status === "past_due" && row.plan_id !== "free") return false
  return true
}

/** Tier id used for pricing CTAs — must stay in sync with `subscriptionRowShowsAsFreePlan`. */
export function pricingUiPlanIdFromRow(row: SubscriptionRowLike): TierId {
  if (subscriptionRowShowsAsFreePlan(row)) return "free"
  return normalizeTierId(row!.plan_id)
}
