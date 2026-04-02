/**
 * Edge Function: manage-subscription
 *
 * POST /functions/v1/manage-subscription
 *
 * Handles subscription lifecycle actions that require custom UX treatment
 * (cancellation with grace period, reactivation, paid-to-paid downgrades,
 * and upgrades / same-tier interval switches via stripe.subscriptions.update).
 * New subscribers without a Stripe subscription still use create-checkout-session.
 *
 * Body:
 *   action              "cancel" | "reactivate" | "downgrade" | "upgrade"
 *   targetPriceId?      string   required for "downgrade" and "upgrade" — allowlisted price
 *   prorationBehavior?  "create_prorations" | "none"   default: "create_prorations"
 *
 * Actions:
 *   cancel      → stripe.subscriptions.update(id, { cancel_at_period_end: true })
 *                 Access continues until current_period_end, then subscription
 *                 is deleted by Stripe and webhook marks it canceled.
 *
 *   reactivate  → stripe.subscriptions.update(id, { cancel_at_period_end: false })
 *                 Only valid while cancel_at_period_end is true (grace period).
 *
 *   downgrade   → stripe.subscriptions.update — lower tier only; proration.
 *
 *   upgrade     → stripe.subscriptions.update — higher tier OR same-tier interval
 *                 switch (e.g. Pro monthly → annual). Replaces the subscription item.
 *
 * All actions optimistically update user_subscriptions in the DB immediately,
 * then the Stripe webhook (customer.subscription.updated) provides the
 * authoritative values a few seconds later.
 *
 * Response 200:  { ok: true, cancelAtPeriodEnd, status, currentPeriodEnd, planId }
 * Response 4xx:  { error: string, code: string }
 *
 * Error codes:
 *   not_authenticated       — missing / invalid JWT
 *   no_subscription         — user has no active Stripe subscription
 *   invalid_action          — unknown action value
 *   invalid_price           — targetPriceId not in allowlist
 *   not_a_downgrade         — targetPriceId is same-tier or higher
 *   already_canceling       — cancel called while already pending cancellation
 *   not_canceling           — reactivate called when cancel_at_period_end is false
 *   stripe_error            — Stripe API failure
 *   db_error                — database failure
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
 */

import Stripe from "npm:stripe@17"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  corsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/cors.ts"
import { getAllPriceIds, normalizeStripePriceId, resolvePriceId } from "../_shared/tiers.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

const VALID_ACTIONS = ["cancel", "reactivate", "downgrade", "upgrade"] as const
type Action = typeof VALID_ACTIONS[number]

/** Tier rank — lower number = lower tier.  Must mirror TIER_RANK in upgrade.tsx */
const TIER_RANK: Record<string, number> = { free: 0, pro: 1 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function err(message: string, code: string, status = 400): Response {
  return json({ error: message, code }, status)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST")    return err("Method not allowed", "method_not_allowed", 405)

  // ── Env ────────────────────────────────────────────────────────────────────
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!stripeKey)                              return err("STRIPE_SECRET_KEY missing", "config_error", 500)
  if (!supabaseUrl || !anonKey || !serviceKey) return err("Supabase env missing", "config_error", 500)

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return err("Missing or malformed Authorization header", "not_authenticated", 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return err("Invalid or expired token", "not_authenticated", 401)

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { action?: string; targetPriceId?: string; prorationBehavior?: string }
  try {
    body = await req.json()
  } catch {
    return err("Invalid JSON body", "bad_request", 400)
  }

  const action = body.action as Action | undefined
  if (!action || !VALID_ACTIONS.includes(action)) {
    return err(
      `action must be one of: ${VALID_ACTIONS.join(", ")}`,
      "invalid_action",
    )
  }

  // ── Fetch current subscription ─────────────────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey)

  const { data: subRow, error: dbError } = await db
    .from("user_subscriptions")
    .select(
      "id, stripe_subscription_id, stripe_customer_id, plan_id, billing_interval, " +
      "status, cancel_at_period_end, current_period_end",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle<{
      id: string
      stripe_subscription_id: string | null
      stripe_customer_id: string | null
      plan_id: string
      billing_interval: string
      status: string
      cancel_at_period_end: boolean
      current_period_end: string | null
    }>()

  if (dbError) {
    console.error("[manage-subscription] DB fetch error:", dbError)
    return err("Failed to read subscription", "db_error", 500)
  }

  if (!subRow?.stripe_subscription_id) {
    return err(
      "No active Stripe subscription found for this user.",
      "no_subscription",
      404,
    )
  }

  const {
    id:                    localSubId,
    stripe_subscription_id: stripeSubId,
    plan_id:               currentPlanId,
    cancel_at_period_end:  isCancelingAlready,
    current_period_end:    currentPeriodEnd,
  } = subRow

  // ── Action-specific validation ─────────────────────────────────────────────
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" })

  // ── CANCEL ─────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    if (isCancelingAlready) {
      return err(
        "Subscription is already scheduled for cancellation at period end.",
        "already_canceling",
      )
    }

    try {
      await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: true,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[manage-subscription] Stripe cancel error:", msg)
      return err(`Stripe error: ${msg}`, "stripe_error", 502)
    }

    // Optimistic DB update — webhook will overwrite with authoritative values
    const { error: updateErr } = await db
      .from("user_subscriptions")
      .update({
        cancel_at_period_end: true,
        canceled_at:          new Date().toISOString(),
      })
      .eq("id", localSubId)

    if (updateErr) {
      console.error("[manage-subscription] DB cancel update error:", updateErr)
      // Stripe already updated — log and continue; webhook will fix DB
    }

    console.log(
      `[manage-subscription] cancel user=${user.id} sub=${stripeSubId}` +
      ` period_end=${currentPeriodEnd}`,
    )

    return json({
      ok: true,
      cancelAtPeriodEnd: true,
      status: subRow.status,
      currentPeriodEnd,
      planId: currentPlanId,
    })
  }

  // ── REACTIVATE ─────────────────────────────────────────────────────────────
  if (action === "reactivate") {
    if (!isCancelingAlready) {
      return err(
        "Subscription is not scheduled for cancellation — nothing to reactivate.",
        "not_canceling",
      )
    }

    try {
      await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: false,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[manage-subscription] Stripe reactivate error:", msg)
      return err(`Stripe error: ${msg}`, "stripe_error", 502)
    }

    const { error: updateErr } = await db
      .from("user_subscriptions")
      .update({
        cancel_at_period_end: false,
        canceled_at:          null,
      })
      .eq("id", localSubId)

    if (updateErr) {
      console.error("[manage-subscription] DB reactivate update error:", updateErr)
    }

    console.log(
      `[manage-subscription] reactivate user=${user.id} sub=${stripeSubId}`,
    )

    return json({
      ok: true,
      cancelAtPeriodEnd: false,
      status: subRow.status,
      currentPeriodEnd,
      planId: currentPlanId,
    })
  }

  // ── DOWNGRADE ──────────────────────────────────────────────────────────────
  if (action === "downgrade") {
    const targetPriceId = body.targetPriceId?.trim()
    if (!targetPriceId) {
      return err("targetPriceId is required for action 'downgrade'", "invalid_price")
    }

    const targetEntry = resolvePriceId(targetPriceId)
    if (!targetEntry) {
      return err(
        `Unknown price ID: "${targetPriceId}". ` +
        `Valid IDs: ${getAllPriceIds().join(", ")}`,
        "invalid_price",
      )
    }

    const currentRank = TIER_RANK[currentPlanId] ?? -1
    const targetRank  = TIER_RANK[targetEntry.tierId] ?? -1

    if (targetRank >= currentRank) {
      return err(
        `targetPriceId resolves to "${targetEntry.tierId}" ` +
        `which is not lower than the current plan "${currentPlanId}". ` +
        "Use the upgrade action for upgrades or interval switches.",
        "not_a_downgrade",
      )
    }

    // Fetch the Stripe subscription to get the item ID for the update
    let stripeSub: Stripe.Subscription
    try {
      stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[manage-subscription] Stripe retrieve error:", msg)
      return err(`Stripe error: ${msg}`, "stripe_error", 502)
    }

    const itemId = stripeSub.items.data[0]?.id
    if (!itemId) {
      return err("Could not find subscription item to update.", "no_item", 500)
    }

    const prorationBehavior =
      (body.prorationBehavior === "none" ? "none" : "create_prorations") as
      Stripe.SubscriptionUpdateParams.ProrationBehavior

    let updatedSub: Stripe.Subscription
    try {
      updatedSub = await stripe.subscriptions.update(stripeSubId, {
        items: [{ id: itemId, price: targetPriceId }],
        proration_behavior: prorationBehavior,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[manage-subscription] Stripe downgrade error:", msg)
      return err(`Stripe error: ${msg}`, "stripe_error", 502)
    }

    // Optimistic DB update
    const newPeriodEnd = updatedSub.current_period_end
      ? new Date(updatedSub.current_period_end * 1000).toISOString()
      : currentPeriodEnd

    const { error: updateErr } = await db
      .from("user_subscriptions")
      .update({
        plan_id:          targetEntry.tierId,
        billing_interval: targetEntry.interval,
        cancel_at_period_end: updatedSub.cancel_at_period_end ?? false,
        current_period_end:   newPeriodEnd,
      })
      .eq("id", localSubId)

    if (updateErr) {
      console.error("[manage-subscription] DB downgrade update error:", updateErr)
    }

    console.log(
      `[manage-subscription] downgrade user=${user.id} ` +
      `${currentPlanId} → ${targetEntry.tierId} ` +
      `proration=${prorationBehavior}`,
    )

    return json({
      ok: true,
      cancelAtPeriodEnd: updatedSub.cancel_at_period_end ?? false,
      status: updatedSub.status,
      currentPeriodEnd: newPeriodEnd,
      planId: targetEntry.tierId,
      billingInterval: targetEntry.interval,
    })
  }

  // ── UPGRADE (higher tier, or same-tier monthly ↔ annual switch) ───────────
  if (action === "upgrade") {
    const targetPriceId = body.targetPriceId?.trim()
    if (!targetPriceId) {
      return err("targetPriceId is required for action 'upgrade'", "invalid_price")
    }

    const targetEntry = resolvePriceId(targetPriceId)
    if (!targetEntry) {
      return err(
        `Unknown price ID: "${targetPriceId}". ` +
        `Valid IDs: ${getAllPriceIds().join(", ")}`,
        "invalid_price",
      )
    }

    let stripeSub: Stripe.Subscription
    try {
      stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[manage-subscription] Stripe retrieve error:", msg)
      return err(`Stripe error: ${msg}`, "stripe_error", 502)
    }

    const currentPriceId = stripeSub.items.data[0]?.price?.id
    if (
      currentPriceId &&
      normalizeStripePriceId(currentPriceId) === normalizeStripePriceId(targetPriceId)
    ) {
      return err("You are already subscribed to this price.", "already_on_this_plan")
    }

    const currentRank = TIER_RANK[currentPlanId] ?? -1
    const targetRank = TIER_RANK[targetEntry.tierId] ?? -1

    if (targetRank < currentRank) {
      return err(
        "Target is a lower tier — use the downgrade action instead.",
        "not_an_upgrade",
      )
    }

    const isTierUpgrade = targetRank > currentRank
    const isIntervalSwitch =
      targetRank === currentRank && targetEntry.tierId === currentPlanId

    if (!isTierUpgrade && !isIntervalSwitch) {
      return err(
        "Invalid upgrade target for your current plan.",
        "invalid_upgrade",
      )
    }

    const itemId = stripeSub.items.data[0]?.id
    if (!itemId) {
      return err("Could not find subscription item to update.", "no_item", 500)
    }

    const prorationBehavior =
      (body.prorationBehavior === "none" ? "none" : "create_prorations") as
      Stripe.SubscriptionUpdateParams.ProrationBehavior

    let updatedSub: Stripe.Subscription
    try {
      updatedSub = await stripe.subscriptions.update(stripeSubId, {
        items: [{ id: itemId, price: targetPriceId }],
        proration_behavior: prorationBehavior,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[manage-subscription] Stripe upgrade error:", msg)
      return err(`Stripe error: ${msg}`, "stripe_error", 502)
    }

    const newPeriodEnd = updatedSub.current_period_end
      ? new Date(updatedSub.current_period_end * 1000).toISOString()
      : currentPeriodEnd

    const { error: updateErr } = await db
      .from("user_subscriptions")
      .update({
        plan_id: targetEntry.tierId,
        billing_interval: targetEntry.interval,
        cancel_at_period_end: updatedSub.cancel_at_period_end ?? false,
        current_period_end: newPeriodEnd,
      })
      .eq("id", localSubId)

    if (updateErr) {
      console.error("[manage-subscription] DB upgrade update error:", updateErr)
    }

    console.log(
      `[manage-subscription] upgrade user=${user.id} ${currentPlanId}→${targetEntry.tierId} ` +
      `interval=${targetEntry.interval}`,
    )

    return json({
      ok: true,
      cancelAtPeriodEnd: updatedSub.cancel_at_period_end ?? false,
      status: updatedSub.status,
      currentPeriodEnd: newPeriodEnd,
      planId: targetEntry.tierId,
      billingInterval: targetEntry.interval,
    })
  }

  // Unreachable — VALID_ACTIONS check above covers all cases
  return err("Unhandled action", "internal_error", 500)
})
