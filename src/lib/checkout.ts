/**
 * Frontend helpers for initiating Stripe Checkout and the Billing Portal.
 *
 * Usage:
 *   import { startCheckout, openBillingPortal } from "@/lib/checkout"
 *   import { getTier } from "@/lib/tiers"
 *
 *   // New subscription → Stripe Checkout
 *   await startCheckout({ stripePriceId: getTier("pro").pricing.monthly.stripePriceId! })
 *
 *   // Existing subscriber managing payment method / invoices (not plan changes)
 *   await openBillingPortal()
 *
 *   // Upgrades / interval switches: use upgradeSubscription() in subscription.ts
 *   // (updates the Stripe subscription in place — do not use startCheckout).
 */

import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutOptions {
  /** Stripe Price ID from tiers config. Required. */
  stripePriceId: string
  /**
   * Where Stripe sends the user after a successful checkout.
   * Defaults to the current origin + /?checkout=success
   */
  successUrl?: string
  /**
   * Where Stripe sends the user if they abandon checkout.
   * Defaults to the current origin + /upgrade
   */
  cancelUrl?: string
  /**
   * If true, do not automatically redirect — return the URL instead.
   * Useful for opening in a new tab or custom redirect logic.
   */
  redirect?: boolean
}

export interface CheckoutResult {
  url: string
  /** checkout = new subscription; portal = managing an existing one */
  type: "checkout" | "portal"
}

export interface ConfirmCheckoutResult {
  planId: string
  status: string
  billingInterval: string | null
  currentPeriodEnd: string | null
  trialEnd: string | null
  hasStripeSubscription: boolean
}

/** Edge functions return this when an anonymous user must sign in before billing. */
export const CHECKOUT_IDENTITY_REQUIRED_CODE = "identity_required" as const

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "CheckoutError"
  }
}

export function isIdentityRequiredCheckoutError(e: unknown): boolean {
  return e instanceof CheckoutError && e.code === CHECKOUT_IDENTITY_REQUIRED_CODE
}

// ─── Core ─────────────────────────────────────────────────────────────────────

const FUNCTION_NAME = "create-checkout-session"

/**
 * Supabase `functions.invoke` sets `error.message` to a generic string for HTTP errors.
 * The edge function body is `{ error: "..." }` — parse it so users see the real reason.
 */
async function checkoutErrorFromInvoke(fnError: unknown): Promise<CheckoutError> {
  const generic =
    fnError instanceof Error ? fnError.message : "Edge function request failed"
  const ctx =
    fnError !== null &&
    typeof fnError === "object" &&
    "context" in fnError &&
    (fnError as { context: unknown }).context instanceof Response
      ? (fnError as { context: Response }).context
      : undefined
  if (!ctx) return new CheckoutError(generic)

  const status = ctx.status
  try {
    const raw = await ctx.clone().text()
    if (!raw.trim()) {
      return new CheckoutError(
        `${generic} (HTTP ${status}). Check Supabase → Edge Functions → logs.`,
        status,
      )
    }
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string; code?: string }
      const code = typeof parsed.code === "string" ? parsed.code : undefined
      if (typeof parsed.error === "string" && parsed.error) {
        return new CheckoutError(parsed.error, status, code)
      }
      if (typeof parsed.message === "string" && parsed.message) {
        return new CheckoutError(parsed.message, status, code)
      }
    } catch {
      /* not JSON */
    }
    return new CheckoutError(raw.slice(0, 500), status)
  } catch {
    return new CheckoutError(generic, status)
  }
}

/**
 * Edge Functions gateway verifies `Authorization: Bearer <jwt>`. A stale `access_token`
 * (or the client falling back to the anon key) often surfaces as "Invalid JWT".
 */
async function getBearerTokenForEdgeFunctions(signInMessage: string): Promise<string> {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new CheckoutError(signInMessage, 401)
  }
  const { data: ref } = await supabase.auth.refreshSession()
  const token =
    ref.session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token
  if (!token) {
    throw new CheckoutError(signInMessage, 401)
  }
  return token
}

/**
 * Call the edge function to get a Stripe Checkout or Billing Portal URL,
 * then redirect the user unless `redirect: false` is passed.
 *
 * Throws `CheckoutError` on any failure so the caller can show a toast/banner.
 */
export async function startCheckout(options: CheckoutOptions): Promise<CheckoutResult> {
  const { stripePriceId, redirect = true } = options

  const origin = window.location.origin
  const successUrl = options.successUrl ?? `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl  = options.cancelUrl  ?? `${origin}/upgrade`

  const accessToken = await getBearerTokenForEdgeFunctions(
    "You must be signed in to subscribe.",
  )

  const { data, error: fnError } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { stripePriceId, successUrl, cancelUrl },
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (fnError) throw await checkoutErrorFromInvoke(fnError)

  const payload = data as { url?: string; type?: string; error?: string; code?: string }
  if (!payload?.url || payload.error) {
    throw new CheckoutError(
      payload.error ?? "Unexpected response from checkout",
      500,
      typeof payload.code === "string" ? payload.code : undefined,
    )
  }

  const result: CheckoutResult = {
    url: payload.url,
    type: (payload.type as CheckoutResult["type"]) ?? "checkout",
  }

  if (redirect) {
    window.location.href = result.url
  }

  return result
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/**
 * Open the Stripe Billing Portal for an existing subscriber.
 *
 * Calls the dedicated `create-portal-session` edge function, which always
 * returns a portal URL — it never starts a Checkout Session.
 *
 * Throws `CheckoutError` with code "no_stripe_customer" (404) if the user
 * has no Stripe record yet; callers should redirect to /upgrade instead.
 */
export async function openBillingPortal(returnUrl?: string): Promise<void> {
  const accessToken = await getBearerTokenForEdgeFunctions("You must be signed in.")

  const { data, error: fnError } = await supabase.functions.invoke("create-portal-session", {
    body: { returnUrl: returnUrl ?? window.location.href },
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (fnError) throw await checkoutErrorFromInvoke(fnError)

  const payload = data as { url?: string; error?: string; code?: string }
  if (!payload?.url) {
    throw new CheckoutError(
      payload?.error ?? "Unexpected response from billing portal",
      500,
      typeof payload?.code === "string" ? payload.code : undefined,
    )
  }

  window.location.href = payload.url
}

/**
 * Check the URL for ?checkout=success after returning from Stripe.
 * Call this on the landing/home page to show a confirmation banner.
 */
export function didReturnFromCheckout(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get("checkout") === "success"
}

/** Stripe appends this when success_url includes `session_id={CHECKOUT_SESSION_ID}`. */
export function getReturnedCheckoutSessionId(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get("session_id")
}

/**
 * Clean up the ?checkout= query param from the URL without a page reload.
 */
export function clearCheckoutParam(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete("checkout")
  url.searchParams.delete("session_id")
  window.history.replaceState({}, "", url.toString())
}

/**
 * Confirm a successful Stripe Checkout return and sync the authoritative
 * subscription snapshot into `user_subscriptions`, without waiting on webhook timing.
 */
export async function confirmCheckoutSession(sessionId?: string): Promise<ConfirmCheckoutResult> {
  const accessToken = await getBearerTokenForEdgeFunctions("You must be signed in.")

  const { data, error: fnError } = await supabase.functions.invoke("confirm-checkout-session", {
    body: sessionId ? { sessionId } : {},
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (fnError) throw await checkoutErrorFromInvoke(fnError)

  const payload = data as Partial<ConfirmCheckoutResult> & { error?: string; code?: string }
  if (!payload || payload.error || !payload.planId) {
    throw new CheckoutError(
      payload?.error ?? "Unexpected response confirming checkout",
      500,
      typeof payload.code === "string" ? payload.code : undefined,
    )
  }

  return {
    planId: payload.planId,
    status: payload.status ?? "active",
    billingInterval: payload.billingInterval ?? null,
    currentPeriodEnd: payload.currentPeriodEnd ?? null,
    trialEnd: payload.trialEnd ?? null,
    hasStripeSubscription: payload.hasStripeSubscription ?? true,
  }
}
