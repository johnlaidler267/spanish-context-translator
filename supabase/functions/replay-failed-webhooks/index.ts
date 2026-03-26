/**
 * Edge Function: replay-failed-webhooks
 *
 * POST /functions/v1/replay-failed-webhooks
 *
 * Dead letter queue processor. Finds webhook events that are in the `failed`
 * state and haven't yet hit the retry cap, then re-runs their handler logic
 * via the shared processEvent function.
 *
 * Typical use cases:
 *   • Transient DB errors during original processing (timeout, lock contention)
 *   • Deploying a bug-fix and replaying events that failed due to the bug
 *   • Manual recovery after a Supabase outage
 *
 * Security:
 *   Protected by a shared secret header (REPLAY_WEBHOOK_SECRET env var).
 *   Call with:  Authorization: Bearer <REPLAY_WEBHOOK_SECRET>
 *   If the secret is not configured the endpoint returns 503 so accidental
 *   open access is impossible.
 *
 * Retry behaviour:
 *   MAX_RETRIES (3 by default, from webhook-processor.ts) caps attempts.
 *   Events that fail all retries are marked `dead_letter`.
 *   Successfully replayed events are marked `processed`.
 *
 * Request body (JSON, all fields optional):
 *   {
 *     "limit":      20,        // max events per run, default 20, max 100
 *     "event_type": "invoice.payment_failed"  // filter to a specific type
 *   }
 *
 * Response body:
 *   {
 *     "processed":   3,   // events now marked processed
 *     "failed":      1,   // events that still failed (retry_count incremented)
 *     "dead_letter": 0,   // events promoted to dead_letter this run
 *     "skipped":     0    // events already at max retries before this run
 *   }
 *
 * Environment variables:
 *   REPLAY_WEBHOOK_SECRET     — required; arbitrary shared secret
 *   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
 *   SUPABASE_URL              — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 */

import Stripe from "npm:stripe@17"
import { createClient } from "npm:@supabase/supabase-js@2"
import { processEvent, MAX_RETRIES } from "../_shared/webhook-processor.ts"
import { corsHeaders } from "../_shared/cors.ts"

interface WebhookEventRow {
  id:              string
  stripe_event_id: string
  event_type:      string
  payload:         Record<string, unknown>
  retry_count:     number
  error_message:   string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const replaySecret = Deno.env.get("REPLAY_WEBHOOK_SECRET")
  if (!replaySecret) {
    console.error("[replay] REPLAY_WEBHOOK_SECRET is not configured")
    return new Response(
      JSON.stringify({ error: "Replay endpoint not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }

  const authHeader = req.headers.get("Authorization") ?? ""
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (token !== replaySecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )
  }

  // ── Env ───────────────────────────────────────────────────────────────────
  const stripeKey  = Deno.env.get("STRIPE_SECRET_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!stripeKey || !supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Missing environment variables" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { limit?: number; event_type?: string } = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch { /* default to empty */ }

  const limit     = Math.min(body.limit ?? 20, 100)
  const typeFilter = body.event_type ?? null

  // ── Query retryable events ─────────────────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey)
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" })

  let query = db
    .from("webhook_events")
    .select("id, stripe_event_id, event_type, payload, retry_count, error_message")
    .eq("status", "failed")
    .lt("retry_count", MAX_RETRIES)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (typeFilter) {
    query = query.eq("event_type", typeFilter)
  }

  const { data: events, error: queryErr } = await query

  if (queryErr) {
    console.error("[replay] Failed to query failed events:", queryErr.message)
    return new Response(
      JSON.stringify({ error: "DB query failed", detail: queryErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }

  const rows = (events ?? []) as WebhookEventRow[]
  console.log(`[replay] Found ${rows.length} retryable failed event(s)`)

  const stats = { processed: 0, failed: 0, dead_letter: 0, skipped: 0 }

  for (const row of rows) {
    const newRetryCount = row.retry_count + 1

    // Increment retry_count before processing so a crash still records the attempt
    await db
      .from("webhook_events")
      .update({ retry_count: newRetryCount, last_retry_at: new Date().toISOString() })
      .eq("id", row.id)

    if (newRetryCount > MAX_RETRIES) {
      // Shouldn't normally reach here given the lt() filter, but guard anyway
      await db
        .from("webhook_events")
        .update({
          status:        "dead_letter",
          error_message: `Exhausted ${MAX_RETRIES} retries. Last error: ${row.error_message}`,
          processed_at:  new Date().toISOString(),
        })
        .eq("id", row.id)
      stats.dead_letter++
      console.warn(`[replay] dead_letter ${row.stripe_event_id} (${row.event_type})`)
      continue
    }

    // Reconstruct the Stripe Event from the stored payload
    const event = row.payload as unknown as Stripe.Event

    try {
      await processEvent(db, stripe, event, { replayLogId: row.id })
      stats.processed++
      console.log(`[replay] ✓ replayed ${row.stripe_event_id} (${row.event_type}) attempt #${newRetryCount}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[replay] ✗ ${row.stripe_event_id} attempt #${newRetryCount}: ${msg}`)

      if (newRetryCount >= MAX_RETRIES) {
        await db
          .from("webhook_events")
          .update({
            status:        "dead_letter",
            error_message: msg,
            processed_at:  new Date().toISOString(),
          })
          .eq("id", row.id)
        stats.dead_letter++
        console.warn(`[replay] dead_letter after ${newRetryCount} attempts: ${row.stripe_event_id}`)
      } else {
        // markEventFailed was called inside processEvent; just tally it
        stats.failed++
      }
    }
  }

  console.log("[replay] Summary:", stats)

  return new Response(JSON.stringify(stats), {
    status:  200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
