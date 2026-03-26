/**
 * Edge Function: create-checkout-session
 *
 * POST /functions/v1/create-checkout-session
 *
 * Body:
 *   stripePriceId  string   — must be in the server-side allowlist
 *   successUrl?    string   — where Stripe redirects on success (defaults to APP_URL)
 *   cancelUrl?     string   — where Stripe redirects on cancel  (defaults to APP_URL/upgrade)
 *
 * Response (200):
 *   { url: string, type: "checkout" | "portal" }
 *     checkout — new subscription: redirect user to Stripe Checkout
 *     portal   — existing subscription: redirect user to Stripe Billing Portal
 *                 to handle upgrades / downgrades / cancellations
 *
 * Response (4xx / 5xx):
 *   { error: string }
 *
 * Environment variables required (set in Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
 *   SUPABASE_URL               — injected automatically by Supabase
 *   SUPABASE_ANON_KEY          — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — injected automatically by Supabase
 *   APP_URL                    — e.g. https://yourapp.com (no trailing slash)
 */

import Stripe from "npm:stripe@17"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  corsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/cors.ts"
import { resolvePriceId, TRIAL_DAYS } from "../_shared/tiers.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  stripePriceId: string
  successUrl?: string
  cancelUrl?: string
}

interface SuccessPayload {
  url: string
  type: "checkout" | "portal"
}

// Minimal shape of the columns we need from user_subscriptions
interface SubscriptionRecord {
  id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
  has_used_trial: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status)
}

/** Statuses that mean the user has an active Stripe subscription to manage. */
const MANAGEABLE_STATUSES = new Set(["active", "trialing", "past_due", "paused"])

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST") return err("Method not allowed", 405)

  // ── Environment ────────────────────────────────────────────────────────────
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const appUrl      = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "")

  if (!stripeKey)   return err("STRIPE_SECRET_KEY is not configured", 500)
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return err("Supabase environment is not configured", 500)
  }

  // ── Auth: verify JWT, resolve user ────────────────────────────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return err("Missing or malformed Authorization header", 401)
  }

  // User-scoped client verifies the JWT without trusting the caller
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return err("Invalid or expired token", 401)

  // Service-role client for privileged DB writes
  const adminClient = createClient(supabaseUrl, serviceKey)

  // ── Parse and validate body ────────────────────────────────────────────────
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return err("Request body must be valid JSON")
  }

  const { stripePriceId, successUrl, cancelUrl } = body

  if (!stripePriceId || typeof stripePriceId !== "string") {
    return err("stripePriceId is required")
  }

  const priceEntry = resolvePriceId(stripePriceId)
  if (!priceEntry) {
    // Never reveal which IDs are valid — generic message
    return err("Invalid price ID")
  }

  // ── Fetch existing subscription record ────────────────────────────────────
  const { data: subscription, error: subError } = await adminClient
    .from("user_subscriptions")
    .select("id, stripe_customer_id, stripe_subscription_id, status, has_used_trial")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle<SubscriptionRecord>()

  if (subError) {
    console.error("DB error fetching subscription:", subError)
    return err("Failed to fetch subscription record", 500)
  }

  // ── Stripe client ──────────────────────────────────────────────────────────
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" })

  // ── Create or retrieve Stripe customer ────────────────────────────────────
  let stripeCustomerId = subscription?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    try {
      // Check whether a customer already exists for this email (avoids duplicates
      // if the DB record was lost or the user signed up via another path)
      const existing = await stripe.customers.list({
        email: user.email,
        limit: 1,
      })

      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          metadata: { supabase_user_id: user.id },
        })
        stripeCustomerId = customer.id
      }
    } catch (e) {
      console.error("Stripe customer error:", e)
      return err("Failed to create Stripe customer", 502)
    }

    // Persist the customer ID — insert a free-tier record if none exists yet
    if (subscription) {
      const { error: updateErr } = await adminClient
        .from("user_subscriptions")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", subscription.id)

      if (updateErr) console.error("Failed to save stripe_customer_id:", updateErr)
    } else {
      const { error: insertErr } = await adminClient
        .from("user_subscriptions")
        .insert({
          user_id: user.id,
          plan_id: "free",
          billing_interval: "monthly",
          stripe_customer_id: stripeCustomerId,
          status: "active",
          cancel_at_period_end: false,
        })

      if (insertErr) console.error("Failed to insert subscription record:", insertErr)
    }
  }

  // ── Checkout vs. Billing Portal ───────────────────────────────────────────
  //
  //  • No active Stripe subscription → Checkout Session (new subscriber)
  //  • Active/trialing/past_due      → Billing Portal   (manages existing sub:
  //      upgrades, downgrades, cancellations, payment method updates)
  //
  const hasManageableSubscription =
    !!subscription?.stripe_subscription_id &&
    MANAGEABLE_STATUSES.has(subscription.status ?? "")

  try {
    if (hasManageableSubscription) {
      // ── Billing Portal (upgrade / downgrade / manage) ────────────────────
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: cancelUrl ?? `${appUrl}/upgrade`,
      })

      const payload: SuccessPayload = { url: portalSession.url, type: "portal" }
      return json(payload)
    } else {
      // ── Checkout Session (new subscription) ──────────────────────────────

      // Determine trial eligibility.
      // Users who have already trialed this service (has_used_trial = true)
      // are not offered another free trial on re-subscription.
      const hasUsedTrial   = subscription?.has_used_trial ?? false
      const configTrialDays = TRIAL_DAYS[priceEntry.tierId] ?? 0
      const trialDays       = hasUsedTrial ? 0 : configTrialDays

      console.log(
        `[checkout] user=${user.id} tier=${priceEntry.tierId}` +
        ` hasUsedTrial=${hasUsedTrial} trialDays=${trialDays}`,
      )

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [{ price: stripePriceId, quantity: 1 }],

        success_url: successUrl ?? `${appUrl}/?checkout=success`,
        cancel_url:  cancelUrl  ?? `${appUrl}/upgrade`,

        subscription_data: {
          ...(trialDays > 0
            ? {
                trial_period_days: trialDays,
                // If no payment method is added before the trial ends, cancel
                // the subscription automatically (user reverts to free).
                trial_settings: {
                  end_behavior: { missing_payment_method: "cancel" },
                },
              }
            : {}),
          metadata: {
            supabase_user_id: user.id,
            tier_id:          priceEntry.tierId,
            billing_interval: priceEntry.interval,
          },
        },

        // Don't require a card upfront for trials — lower friction.
        // For non-trial checkouts the default ("always") keeps payment required.
        ...(trialDays > 0 ? { payment_method_collection: "if_required" } : {}),

        // Prefill the email so users don't have to retype it
        customer_email: !stripeCustomerId ? (user.email ?? undefined) : undefined,

        allow_promotion_codes: true,
        billing_address_collection: "auto",

        // Show a back link in Stripe-hosted Checkout
        after_expiration: { recovery: { enabled: true } },
      })

      if (!session.url) return err("Stripe did not return a checkout URL", 502)

      const payload: SuccessPayload = { url: session.url, type: "checkout" }
      return json(payload)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("Stripe session error:", message)
    return err(`Stripe error: ${message}`, 502)
  }
})
