/**
 * Edge Function: confirm-checkout-session
 *
 * POST /functions/v1/confirm-checkout-session
 *
 * Fallback sync path after returning from Stripe Checkout. This lets the app
 * confirm the successful session and update `user_subscriptions` immediately,
 * without relying solely on webhook delivery timing.
 *
 * Body:
 *   sessionId string  — Stripe Checkout Session ID (cs_...)
 *
 * Response (200):
 * {
 *   planId: string,
 *   status: string,
 *   billingInterval: "monthly" | "annual" | null,
 *   currentPeriodEnd: string | null,
 *   trialEnd: string | null,
 *   hasStripeSubscription: boolean
 * }
 */

import Stripe from "npm:stripe@17"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  corsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/cors.ts"
import { resolvePriceId, type BillingInterval, type TierId } from "../_shared/tiers.ts"
import { castStatus, fromUnix } from "../_shared/webhook-processor.ts"

interface RequestBody {
  sessionId?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status)
}

/** Expand can still leave `subscription` as an id string; retrieve in that case. */
async function subscriptionFromSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<Stripe.Subscription | null> {
  const subField = session.subscription
  if (subField && typeof subField === "object") {
    return subField as Stripe.Subscription
  }
  if (typeof subField === "string") {
    try {
      return await stripe.subscriptions.retrieve(subField)
    } catch {
      return null
    }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") return err("Method not allowed", 405)

  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!stripeKey) return err("STRIPE_SECRET_KEY is not configured", 500)
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return err("Supabase environment is not configured", 500)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return err("Missing or malformed Authorization header", 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return err("Invalid or expired token", 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return err("Request body must be valid JSON")
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" })
  const adminClient = createClient(supabaseUrl, serviceKey)

  const { data: currentRow, error: currentRowError } = await adminClient
    .from("user_subscriptions")
    .select("id, stripe_customer_id, cancel_at_period_end")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle<{
      id: string
      stripe_customer_id: string | null
      cancel_at_period_end: boolean
    }>()

  if (currentRowError) {
    return err("Failed to load current subscription", 500)
  }

  const sessionId = body.sessionId?.trim()

  let stripeCustomerId: string | null = null
  let stripeSub: Stripe.Subscription | null = null

  if (sessionId) {
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return err(`Could not load checkout session: ${msg}`, 400)
    }

    if (session.mode !== "subscription") {
      return err("Checkout session is not a subscription session", 400)
    }
    // Trials with `payment_method_collection: "if_required"` often complete with
    // `status: "complete"` and a non-"paid" payment_status (e.g. unpaid / no_payment_required).
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return err("Checkout session is not complete", 409)
    }

    stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id
    stripeSub = await subscriptionFromSession(stripe, session)

    // Right after redirect, subscription is occasionally still null until Stripe finishes wiring;
    // same session id + short delay usually resolves it.
    for (let attempt = 0; attempt < 3 && (!stripeSub || !stripeCustomerId); attempt++) {
      await new Promise((r) => setTimeout(r, 450))
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["subscription"],
        })
      } catch {
        break
      }
      stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id
      stripeSub = await subscriptionFromSession(stripe, session)
    }
  } else {
    stripeCustomerId = currentRow?.stripe_customer_id ?? null
    if (!stripeCustomerId) {
      return err("No checkout session id or saved Stripe customer found", 400)
    }

    try {
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
        limit: 10,
      })

      stripeSub =
        subs.data.find((sub) => ["trialing", "active", "past_due", "incomplete", "paused"].includes(sub.status)) ??
        subs.data[0] ??
        null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return err(`Could not load customer subscriptions: ${msg}`, 400)
    }
  }

  if (!stripeCustomerId || !stripeSub) {
    return err("Could not resolve an active Stripe subscription", 409)
  }

  if (currentRow?.stripe_customer_id && currentRow.stripe_customer_id !== stripeCustomerId) {
    return err("Checkout session belongs to a different customer", 403)
  }

  const priceId = stripeSub.items.data[0]?.price?.id ?? null
  const priceEntry = priceId ? resolvePriceId(priceId) : null

  const fields = {
    user_id:                user.id,
    stripe_subscription_id: stripeSub.id,
    stripe_customer_id:     stripeCustomerId,
    status:                 castStatus(stripeSub.status),
    plan_id:                (priceEntry?.tierId ?? "free") as TierId,
    billing_interval:       (priceEntry?.interval ?? "monthly") as BillingInterval,
    current_period_start:   fromUnix(stripeSub.current_period_start),
    current_period_end:     fromUnix(stripeSub.current_period_end),
    trial_start:            fromUnix(stripeSub.trial_start ?? undefined),
    trial_end:              fromUnix(stripeSub.trial_end ?? undefined),
    cancel_at_period_end:   stripeSub.cancel_at_period_end,
    canceled_at:            stripeSub.canceled_at ? fromUnix(stripeSub.canceled_at) : null,
    archived_at:            null,
    past_due_since:         null,
  }

  if (currentRow) {
    const { error: updateError } = await adminClient
      .from("user_subscriptions")
      .update(fields)
      .eq("id", currentRow.id)

    if (updateError) {
      return err(`Failed to update subscription: ${updateError.message}`, 500)
    }
  } else {
    const { error: insertError } = await adminClient
      .from("user_subscriptions")
      .insert(fields)

    if (insertError) {
      return err(`Failed to insert subscription: ${insertError.message}`, 500)
    }
  }

  return json({
    planId: fields.plan_id,
    status: fields.status,
    billingInterval: fields.billing_interval,
    currentPeriodEnd: fields.current_period_end,
    trialEnd: fields.trial_end,
    hasStripeSubscription: true,
  })
})
