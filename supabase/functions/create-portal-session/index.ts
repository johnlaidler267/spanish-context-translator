/**
 * Edge Function: create-portal-session
 *
 * POST /functions/v1/create-portal-session
 *
 * Creates a Stripe Billing Portal session for the authenticated user.
 * The portal lets users manage their subscription, update their payment
 * method, download invoices, and cancel — all via Stripe's hosted UI.
 *
 * Unlike create-checkout-session, this endpoint ALWAYS returns a portal URL.
 * It never creates a Checkout Session. Call it only when you know the user
 * already has a Stripe customer record (i.e. they have or had a paid sub).
 *
 * Body (all optional):
 *   returnUrl?  string  — URL Stripe sends the user back to after closing the portal.
 *                         Defaults to APP_URL/settings.
 *
 * Response 200:
 *   { url: string }
 *
 * Response 4xx / 5xx:
 *   { error: string, code?: string }
 *
 * Codes returned in error responses:
 *   no_stripe_customer — user has no Stripe customer record (free-tier, never subscribed).
 *                        Frontend should redirect to /upgrade instead of calling this.
 *   not_authenticated  — missing or invalid JWT.
 *   stripe_error       — Stripe API failure.
 *
 * Environment variables (Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY            — sk_live_... or sk_test_...
 *   SUPABASE_URL                 — injected automatically
 *   SUPABASE_ANON_KEY            — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY    — injected automatically
 *   APP_URL                      — e.g. https://yourapp.com (no trailing slash)
 */

import Stripe from "npm:stripe@17"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  corsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/cors.ts"

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

  // ── Environment ────────────────────────────────────────────────────────────
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const appUrl      = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "")

  if (!stripeKey)                        return err("STRIPE_SECRET_KEY not configured", "config_error", 500)
  if (!supabaseUrl || !anonKey || !serviceKey) return err("Supabase env not configured", "config_error", 500)

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
  let returnUrl = `${appUrl}/settings`
  try {
    const body = await req.json() as { returnUrl?: string }
    if (typeof body.returnUrl === "string" && body.returnUrl) {
      returnUrl = body.returnUrl
    }
  } catch {
    // Empty body is fine — returnUrl stays at default
  }

  // ── Fetch Stripe customer ID ───────────────────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey)

  const { data: subRow, error: dbError } = await db
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle<{ stripe_customer_id: string | null }>()

  if (dbError) {
    console.error("[create-portal-session] DB error:", dbError)
    return err("Failed to fetch subscription record", "db_error", 500)
  }

  const stripeCustomerId = subRow?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    // User has never subscribed — there is no Stripe customer to open a portal for.
    // The frontend should direct them to /upgrade instead.
    return err(
      "No Stripe customer found. Subscribe to a plan before managing billing.",
      "no_stripe_customer",
      404,
    )
  }

  // ── Create Billing Portal session ─────────────────────────────────────────
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" })

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   stripeCustomerId,
      return_url: returnUrl,
    })

    console.log(
      `[create-portal-session] user=${user.id} customer=${stripeCustomerId}` +
      ` return_url=${returnUrl}`,
    )

    return json({ url: session.url })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[create-portal-session] Stripe error:", message)
    return err(`Stripe error: ${message}`, "stripe_error", 502)
  }
})
