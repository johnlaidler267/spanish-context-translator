/**
 * Shared Stripe webhook event processor.
 *
 * Extracted from stripe-webhook/index.ts so that:
 *   1. stripe-webhook/index.ts is a thin HTTP + sig-verification wrapper.
 *   2. replay-failed-webhooks/index.ts can replay failed events without
 *      re-verifying signatures or re-inserting duplicate event log rows.
 *
 * The key entry point is `processEvent`. Callers pass an optional `replayLogId`
 * to skip the deduplication insert and instead update an existing log row.
 */

import Stripe from "npm:stripe@17"
import { type SupabaseClient } from "npm:@supabase/supabase-js@2"
import { resolvePriceId } from "./tiers.ts"
import { sendTrialReminderEmail, sendTrialExpiredEmail } from "./email.ts"

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stripe subscription statuses that represent an access-granting state. */
export const ACTIVE_STATUSES = new Set(["active", "trialing"])

export const HANDLED_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
])

/** Maximum number of replay attempts before marking an event dead_letter. */
export const MAX_RETRIES = 3

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface SubRow {
  id: string
  user_id: string
  status: string
  stripe_subscription_id: string | null
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Resolve the internal user_id for a Stripe event.
 * Resolution order:
 *   1. metadata.supabase_user_id  (set during Checkout Session creation)
 *   2. stripe_customer_id lookup  (fallback if metadata was absent)
 */
export async function resolveUserId(
  db: SupabaseClient,
  stripeCustomerId: string,
  metadataUserId?: string,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId

  const { data } = await db
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .is("archived_at", null)
    .maybeSingle<{ user_id: string }>()

  return data?.user_id ?? null
}

/**
 * Find the active subscription row by stripe_subscription_id.
 * Also accepts a fallback lookup by stripe_customer_id.
 */
export async function findSubscription(
  db: SupabaseClient,
  opts: { stripeSubscriptionId?: string; stripeCustomerId?: string },
): Promise<SubRow | null> {
  if (opts.stripeSubscriptionId) {
    const { data } = await db
      .from("user_subscriptions")
      .select("id, user_id, status, stripe_subscription_id")
      .eq("stripe_subscription_id", opts.stripeSubscriptionId)
      .is("archived_at", null)
      .maybeSingle<SubRow>()
    if (data) return data
  }

  if (opts.stripeCustomerId) {
    const { data } = await db
      .from("user_subscriptions")
      .select("id, user_id, status, stripe_subscription_id")
      .eq("stripe_customer_id", opts.stripeCustomerId)
      .is("archived_at", null)
      .maybeSingle<SubRow>()
    return data ?? null
  }

  return null
}

/** Convert a Unix timestamp (seconds) → ISO 8601 string, or null. */
export function fromUnix(ts: number | null | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null
}

/** Cast a Stripe subscription status to our DB enum, defaulting safely. */
export function castStatus(stripeStatus: string): string {
  const allowed = new Set([
    "trialing", "active", "past_due", "paused",
    "canceled", "incomplete", "incomplete_expired", "unpaid",
  ])
  return allowed.has(stripeStatus) ? stripeStatus : "incomplete"
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * customer.subscription.created
 *
 * Finds the user's free-tier row (by customer ID) and fills in subscription
 * details, or inserts a new row if none exists.
 */
async function handleSubscriptionCreated(
  db: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = await resolveUserId(
    db,
    sub.customer as string,
    sub.metadata?.supabase_user_id,
  )
  if (!userId) {
    console.warn(`[subscription.created] Could not resolve user for customer ${sub.customer}`)
    return
  }

  const priceId    = sub.items.data[0]?.price?.id ?? null
  const priceEntry = priceId ? resolvePriceId(priceId) : null

  const fields = {
    user_id:                userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id:     sub.customer as string,
    status:                 castStatus(sub.status),
    plan_id:                priceEntry?.tierId ?? "free",
    billing_interval:       priceEntry?.interval ?? "monthly",
    current_period_start:   fromUnix(sub.current_period_start),
    current_period_end:     fromUnix(sub.current_period_end),
    trial_start:            fromUnix(sub.trial_start ?? undefined),
    trial_end:              fromUnix(sub.trial_end ?? undefined),
    cancel_at_period_end:   sub.cancel_at_period_end,
    canceled_at:            null,
    archived_at:            null,
    past_due_since:         null,  // reset on new subscription
  }

  const existing = await findSubscription(db, { stripeCustomerId: sub.customer as string })

  if (existing) {
    const { error } = await db.from("user_subscriptions").update(fields).eq("id", existing.id)
    if (error) throw new Error(`DB update failed: ${error.message}`)
  } else {
    const { error } = await db.from("user_subscriptions").insert(fields)
    if (error) throw new Error(`DB insert failed: ${error.message}`)
  }

  console.log(`[subscription.created] user=${userId} sub=${sub.id} status=${sub.status}`)
}

/**
 * customer.subscription.updated
 *
 * Handles plan upgrades/downgrades, status changes, period renewals,
 * cancel_at_period_end toggles, trial conversions.
 */
async function handleSubscriptionUpdated(
  db: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const existing = await findSubscription(db, { stripeSubscriptionId: sub.id })
  if (!existing) {
    console.warn(`[subscription.updated] No row found for sub=${sub.id}, treating as created`)
    return handleSubscriptionCreated(db, sub)
  }

  const priceId    = sub.items.data[0]?.price?.id ?? null
  const priceEntry = priceId ? resolvePriceId(priceId) : null

  const updates: Record<string, unknown> = {
    status:               castStatus(sub.status),
    plan_id:              priceEntry?.tierId ?? "free",
    billing_interval:     priceEntry?.interval ?? "monthly",
    current_period_start: fromUnix(sub.current_period_start),
    current_period_end:   fromUnix(sub.current_period_end),
    trial_start:          fromUnix(sub.trial_start ?? undefined),
    trial_end:            fromUnix(sub.trial_end ?? undefined),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at:          sub.canceled_at ? fromUnix(sub.canceled_at) : null,
  }

  // Clear past_due_since when the subscription recovers to an active state
  if (ACTIVE_STATUSES.has(sub.status) && existing.status === "past_due") {
    updates.past_due_since = null
    console.log(`[subscription.updated] past_due → ${sub.status} cleared for user=${existing.user_id}`)
  }

  const { error } = await db.from("user_subscriptions").update(updates).eq("id", existing.id)
  if (error) throw new Error(`DB update failed: ${error.message}`)

  console.log(
    `[subscription.updated] user=${existing.user_id} sub=${sub.id}` +
    ` status=${sub.status} plan=${priceEntry?.tierId ?? "unknown"}`,
  )
}

/**
 * customer.subscription.trial_will_end
 *
 * Stripe fires this ~3 days before a trial ends. Sends a reminder email.
 */
async function handleTrialWillEnd(
  db: SupabaseClient,
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "") ?? "http://localhost:5173"

  const userId = await resolveUserId(db, sub.customer as string, sub.metadata?.supabase_user_id)
  if (!userId) {
    console.warn(`[trial_will_end] Could not resolve user for customer ${sub.customer}`)
    return null
  }

  const trialEndUnix = sub.trial_end
  if (!trialEndUnix) {
    console.warn(`[trial_will_end] sub=${sub.id} has no trial_end — skipping email`)
    return userId
  }
  const trialEndDate = new Date(trialEndUnix * 1000)
  const daysLeft = Math.max(0, Math.round((trialEndDate.getTime() - Date.now()) / 86_400_000))

  const priceId    = sub.items.data[0]?.price?.id ?? null
  const priceEntry = priceId ? resolvePriceId(priceId) : null
  const planName   = priceEntry
    ? priceEntry.tierId.charAt(0).toUpperCase() + priceEntry.tierId.slice(1)
    : "paid"

  let userEmail: string | null = null
  try {
    const customer = await stripe.customers.retrieve(sub.customer as string)
    if (!customer.deleted) userEmail = customer.email ?? null
  } catch (e) {
    console.warn(`[trial_will_end] Could not fetch customer email: ${e}`)
  }

  if (!userEmail) {
    console.warn(`[trial_will_end] No email for customer ${sub.customer} — skipping email`)
    return userId
  }

  let portalUrl = `${appUrl}/upgrade`
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   sub.customer as string,
      return_url: `${appUrl}/settings`,
    })
    portalUrl = portalSession.url
  } catch (e) {
    console.warn(`[trial_will_end] Could not create portal session: ${e}`)
  }

  await sendTrialReminderEmail({ to: userEmail, planName, daysLeft, trialEndDate, portalUrl, appUrl })

  console.log(
    `[trial_will_end] user=${userId} plan=${planName}` +
    ` trial_end=${trialEndDate.toISOString()} days_left=${daysLeft}`,
  )

  return userId
}

/**
 * customer.subscription.deleted
 *
 * Soft-cancels the row. If this was a trial that ended without a payment
 * method, sends a "trial expired" email.
 */
async function handleSubscriptionDeleted(
  db: SupabaseClient,
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<void> {
  const existing = await findSubscription(db, { stripeSubscriptionId: sub.id })
  if (!existing) {
    console.warn(`[subscription.deleted] No row found for sub=${sub.id} — nothing to cancel`)
    return
  }

  const canceledAt = fromUnix(sub.canceled_at ?? undefined) ?? new Date().toISOString()

  const { error } = await db
    .from("user_subscriptions")
    .update({
      status:               "canceled",
      canceled_at:           canceledAt,
      cancel_at_period_end:  false,
      current_period_end:    fromUnix(sub.current_period_end),
      past_due_since:        null,  // clear on full cancellation
    })
    .eq("id", existing.id)

  if (error) throw new Error(`DB update failed: ${error.message}`)

  console.log(`[subscription.deleted] user=${existing.user_id} sub=${sub.id} canceled_at=${canceledAt}`)

  const wasTrialing = sub.status === "canceled" && sub.trial_end !== null
  if (wasTrialing) {
    const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "") ?? "http://localhost:5173"
    let userEmail: string | null = null
    try {
      const customer = await stripe.customers.retrieve(sub.customer as string)
      if (!customer.deleted) userEmail = customer.email ?? null
    } catch { /* ignore */ }

    const priceId    = sub.items.data[0]?.price?.id ?? null
    const priceEntry = priceId ? resolvePriceId(priceId) : null
    const planName   = priceEntry
      ? priceEntry.tierId.charAt(0).toUpperCase() + priceEntry.tierId.slice(1)
      : "paid"

    if (userEmail) {
      await sendTrialExpiredEmail({
        to:         userEmail,
        planName,
        upgradeUrl: `${appUrl}/upgrade`,
        appUrl,
      })
    }
  }
}

/**
 * invoice.payment_succeeded
 *
 * Payment cleared. Advances current_period_end and heals past_due → active.
 * Also clears past_due_since so the grace period resets on the next failure.
 */
async function handleInvoicePaymentSucceeded(
  db: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  const stripeSubId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id ?? null

  if (!stripeSubId) {
    await upsertInvoice(db, invoice, null)
    return
  }

  const existing = await findSubscription(db, { stripeSubscriptionId: stripeSubId })
  if (!existing) {
    console.warn(`[invoice.payment_succeeded] No subscription row for sub=${stripeSubId}`)
    await upsertInvoice(db, invoice, null)
    return
  }

  const lineEnd      = invoice.lines?.data?.[0]?.period?.end
  const nextPeriodEnd = fromUnix(lineEnd) ?? fromUnix((invoice as unknown as { period_end?: number }).period_end)

  const updates: Record<string, unknown> = { current_period_end: nextPeriodEnd }

  if (existing.status === "past_due") {
    updates.status        = "active"
    updates.past_due_since = null   // clear grace-period clock
    console.log(`[invoice.payment_succeeded] Restoring past_due→active user=${existing.user_id}`)
  }

  const { error: subErr } = await db
    .from("user_subscriptions")
    .update(updates)
    .eq("id", existing.id)

  if (subErr) throw new Error(`Subscription update failed: ${subErr.message}`)

  await upsertInvoice(db, invoice, existing.id)

  console.log(
    `[invoice.payment_succeeded] user=${existing.user_id}` +
    ` invoice=${invoice.id} next_period_end=${nextPeriodEnd}`,
  )
}

/**
 * invoice.payment_failed
 *
 * Payment declined. Marks the subscription past_due and records the timestamp
 * so the grace-period logic in enforce-limits knows when to start restricting.
 */
async function handleInvoicePaymentFailed(
  db: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  const stripeSubId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id ?? null

  if (!stripeSubId) {
    await upsertInvoice(db, invoice, null)
    return
  }

  const existing = await findSubscription(db, { stripeSubscriptionId: stripeSubId })
  if (!existing) {
    console.warn(`[invoice.payment_failed] No subscription row for sub=${stripeSubId}`)
    await upsertInvoice(db, invoice, null)
    return
  }

  if (ACTIVE_STATUSES.has(existing.status)) {
    const now = new Date().toISOString()
    const { error } = await db
      .from("user_subscriptions")
      .update({
        status: "past_due",
        // Only set past_due_since once — don't overwrite on subsequent retries
        // so the grace period starts from the FIRST failure.
        past_due_since: existing.status !== "past_due" ? now : undefined,
      })
      .eq("id", existing.id)
    if (error) throw new Error(`Subscription update failed: ${error.message}`)
  }

  await upsertInvoice(db, invoice, existing.id)

  console.warn(
    `[invoice.payment_failed] user=${existing.user_id}` +
    ` invoice=${invoice.id} amount=${invoice.amount_due}`,
  )
}

// ─── Invoice upsert ───────────────────────────────────────────────────────────

export async function upsertInvoice(
  db: SupabaseClient,
  invoice: Stripe.Invoice,
  subscriptionRowId: string | null,
): Promise<void> {
  const userId = await resolveUserId(
    db,
    invoice.customer as string,
    invoice.subscription_details?.metadata?.supabase_user_id,
  )

  if (!userId) {
    console.warn(`[upsertInvoice] Cannot resolve user for invoice ${invoice.id}`)
    return
  }

  const { error } = await db.from("billing_invoices").upsert(
    {
      user_id:                   userId,
      subscription_id:           subscriptionRowId,
      stripe_invoice_id:         invoice.id,
      stripe_charge_id:          typeof invoice.charge === "string" ? invoice.charge : null,
      stripe_payment_intent_id:  typeof invoice.payment_intent === "string" ? invoice.payment_intent : null,
      amount_due_cents:          invoice.amount_due,
      amount_paid_cents:         invoice.amount_paid,
      amount_remaining_cents:    invoice.amount_remaining,
      currency:                  invoice.currency,
      status:                    invoice.status ?? "open",
      billing_reason:            invoice.billing_reason ?? null,
      collection_method:         invoice.collection_method ?? null,
      invoice_date:              fromUnix(invoice.created),
      due_date:                  fromUnix(invoice.due_date ?? undefined),
      paid_at:                   invoice.status === "paid"
        ? fromUnix(invoice.status_transitions?.paid_at ?? undefined)
        : null,
      period_start:              fromUnix(invoice.period_start),
      period_end:                fromUnix(invoice.period_end),
      invoice_pdf_url:           invoice.invoice_pdf ?? null,
      hosted_invoice_url:        invoice.hosted_invoice_url ?? null,
      stripe_payload:            invoice as unknown as Record<string, unknown>,
    },
    { onConflict: "stripe_invoice_id" },
  )

  if (error) throw new Error(`Invoice upsert failed: ${error.message}`)
}

// ─── Event log helpers ────────────────────────────────────────────────────────

/**
 * Insert the raw event into webhook_events.
 * Returns the row id, or null if this is a duplicate (already exists).
 */
export async function logEventReceived(
  db: SupabaseClient,
  event: Stripe.Event,
): Promise<string | null> {
  const { data, error } = await db
    .from("webhook_events")
    .insert({
      stripe_event_id: event.id,
      event_type:      event.type,
      status:          "received",
      payload:         event as unknown as Record<string, unknown>,
    })
    .select("id")
    .single<{ id: string }>()

  if (error) {
    if (error.code === "23505") return null  // duplicate
    throw new Error(`Failed to log event: ${error.message}`)
  }

  return data.id
}

export async function markEventProcessed(
  db: SupabaseClient,
  logId: string,
  userId: string | null,
): Promise<void> {
  await db
    .from("webhook_events")
    .update({ status: "processed", user_id: userId, processed_at: new Date().toISOString() })
    .eq("id", logId)
}

export async function markEventFailed(
  db: SupabaseClient,
  logId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .from("webhook_events")
    .update({ status: "failed", error_message: errorMessage, processed_at: new Date().toISOString() })
    .eq("id", logId)
}

export async function markEventSkipped(db: SupabaseClient, logId: string): Promise<void> {
  await db
    .from("webhook_events")
    .update({ status: "skipped", processed_at: new Date().toISOString() })
    .eq("id", logId)
}

export async function markEventDeadLetter(
  db: SupabaseClient,
  logId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .from("webhook_events")
    .update({
      status:        "dead_letter",
      error_message: errorMessage,
      processed_at:  new Date().toISOString(),
    })
    .eq("id", logId)
}

// ─── Main processor ───────────────────────────────────────────────────────────

export interface ProcessEventOptions {
  /**
   * If provided, skip logEventReceived and instead update this existing log
   * row. Used by the replay function when re-running a previously failed event.
   */
  replayLogId?: string
}

/**
 * Core event processor. Called by:
 *   - stripe-webhook/index.ts  (normal path, no replayLogId)
 *   - replay-failed-webhooks/index.ts  (replay path, replayLogId set)
 */
export async function processEvent(
  db: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
  opts: ProcessEventOptions = {},
): Promise<void> {
  const { replayLogId } = opts

  let logId: string | null

  if (replayLogId) {
    // Replay mode: update existing row to 'received' to indicate retry in progress
    logId = replayLogId
    await db
      .from("webhook_events")
      .update({ status: "received", error_message: null, last_retry_at: new Date().toISOString() })
      .eq("id", logId)
  } else {
    // Normal mode: attempt to insert; null = duplicate
    try {
      logId = await logEventReceived(db, event)
    } catch (e) {
      console.error(`[${event.id}] Failed to insert event log:`, e)
      return
    }

    if (logId === null) {
      console.log(`[${event.id}] Duplicate event — skipped`)
      return
    }
  }

  if (!HANDLED_TYPES.has(event.type)) {
    console.log(`[${event.id}] Unhandled event type: ${event.type}`)
    await markEventSkipped(db, logId)
    return
  }

  let resolvedUserId: string | null = null

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(db, event.data.object as Stripe.Subscription)
        resolvedUserId = await resolveUserId(
          db,
          (event.data.object as Stripe.Subscription).customer as string,
          (event.data.object as Stripe.Subscription).metadata?.supabase_user_id,
        )
        break

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(db, event.data.object as Stripe.Subscription)
        resolvedUserId = await resolveUserId(
          db,
          (event.data.object as Stripe.Subscription).customer as string,
          (event.data.object as Stripe.Subscription).metadata?.supabase_user_id,
        )
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(db, stripe, event.data.object as Stripe.Subscription)
        resolvedUserId = await resolveUserId(
          db,
          (event.data.object as Stripe.Subscription).customer as string,
        )
        break

      case "customer.subscription.trial_will_end":
        resolvedUserId = await handleTrialWillEnd(
          db,
          stripe,
          event.data.object as Stripe.Subscription,
        )
        break

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(db, event.data.object as Stripe.Invoice)
        resolvedUserId = await resolveUserId(
          db,
          (event.data.object as Stripe.Invoice).customer as string,
        )
        break

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(db, event.data.object as Stripe.Invoice)
        resolvedUserId = await resolveUserId(
          db,
          (event.data.object as Stripe.Invoice).customer as string,
        )
        break
    }

    await markEventProcessed(db, logId, resolvedUserId)
    console.log(`[${event.id}] ✓ ${event.type}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[${event.id}] ✗ ${event.type} — ${msg}`)
    await markEventFailed(db, logId, msg)
    throw e  // re-throw so the replay function can increment retry_count
  }
}
