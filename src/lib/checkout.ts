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
 *   // Existing subscriber → Stripe Billing Portal (manage/cancel/invoices)
 *   await openBillingPortal()
 */

import { supabase, getAccessToken } from "@/lib/supabase"

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

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "CheckoutError"
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

const FUNCTION_NAME = "create-checkout-session"

/**
 * Call the edge function to get a Stripe Checkout or Billing Portal URL,
 * then redirect the user unless `redirect: false` is passed.
 *
 * Throws `CheckoutError` on any failure so the caller can show a toast/banner.
 */
export async function startCheckout(options: CheckoutOptions): Promise<CheckoutResult> {
  const { stripePriceId, redirect = true } = options

  const origin = window.location.origin
  const successUrl = options.successUrl ?? `${origin}/?checkout=success`
  const cancelUrl  = options.cancelUrl  ?? `${origin}/upgrade`

  // Require the user to be authenticated
  const token = await getAccessToken()
  if (!token) throw new CheckoutError("You must be signed in to subscribe.", 401)

  const { data: { session } } = await supabase.auth.getSession()
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ stripePriceId, successUrl, cancelUrl }),
  })

  let payload: { url?: string; type?: string; error?: string }
  try {
    payload = await res.json()
  } catch {
    throw new CheckoutError(`Server error (HTTP ${res.status})`, res.status)
  }

  if (!res.ok || payload.error || !payload.url) {
    throw new CheckoutError(
      payload.error ?? `Unexpected error (HTTP ${res.status})`,
      res.status,
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new CheckoutError("You must be signed in.", 401)

  const functionUrl =
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ returnUrl: returnUrl ?? window.location.href }),
  })

  let payload: { url?: string; error?: string; code?: string }
  try {
    payload = await res.json()
  } catch {
    throw new CheckoutError(`Server error (HTTP ${res.status})`, res.status)
  }

  if (!res.ok || !payload.url) {
    throw new CheckoutError(
      payload.error ?? `Unexpected error (HTTP ${res.status})`,
      res.status,
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

/**
 * Clean up the ?checkout= query param from the URL without a page reload.
 */
export function clearCheckoutParam(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete("checkout")
  window.history.replaceState({}, "", url.toString())
}
