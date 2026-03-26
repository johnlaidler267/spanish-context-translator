/**
 * Edge Function: stripe-webhook
 *
 * POST /functions/v1/stripe-webhook
 *
 * Thin HTTP wrapper: verifies the Stripe signature, then hands off to the
 * shared processEvent function in _shared/webhook-processor.ts.
 *
 * Events handled (see webhook-processor.ts for full details):
 *   customer.subscription.created / updated / deleted / trial_will_end
 *   invoice.payment_succeeded / payment_failed
 *
 * Response contract:
 *   Always returns 200 with { received: true } so Stripe does not retry.
 *   Processing errors are logged to webhook_events.error_message but never
 *   cause a non-200 response.
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET     — whsec_... (Stripe → Webhooks → signing secret)
 *   SUPABASE_URL              — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 *   PAST_DUE_GRACE_DAYS       — optional, defaults to 3 (see grace-period.ts)
 *   APP_URL                   — public app URL for email links (optional)
 */

import Stripe from "npm:stripe@17"
import { createClient } from "npm:@supabase/supabase-js@2"
import { processEvent } from "../_shared/webhook-processor.ts"

const ACK = new Response(JSON.stringify({ received: true }), {
  status:  200,
  headers: { "Content-Type": "application/json" },
})

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const stripeKey     = Deno.env.get("STRIPE_SECRET_KEY")
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")
  const supabaseUrl   = Deno.env.get("SUPABASE_URL")
  const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!stripeKey || !webhookSecret) {
    console.error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET")
    return ACK  // config error — don't let Stripe retry forever
  }
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase environment variables")
    return ACK
  }

  // IMPORTANT: read raw bytes before any JSON parsing — Stripe signs the raw body
  const rawBody   = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    console.error("Missing stripe-signature header")
    return new Response("Missing signature", { status: 400 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`Stripe signature verification failed: ${msg}`)
    return new Response(`Webhook signature invalid: ${msg}`, { status: 400 })
  }

  // Return 200 immediately — process in background so Stripe doesn't time out
  const db = createClient(supabaseUrl, serviceKey)
  EdgeRuntime.waitUntil(processEvent(db, stripe, event))

  return ACK
})
