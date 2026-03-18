/**
 * Subscription status check.
 *
 * SERVER-SIDE (required): Your backend must validate subscription before
 * allowing translate/analysis requests. Reject with 403 if lapsed.
 * Client-side checks can be bypassed; server enforcement is mandatory.
 *
 * TODO: Replace checkSubscriptionStatus with real API call to your backend.
 */

export type SubscriptionStatus = "active" | "lapsed"

export interface SubscriptionResult {
  status: SubscriptionStatus
}

/**
 * Check if the user's subscription is active.
 * Wire this to your backend: GET /api/subscription or similar.
 */
export async function checkSubscriptionStatus(): Promise<SubscriptionResult> {
  // Simulate lapsed for testing: set VITE_SIMULATE_LAPSED=true in .env
  if (import.meta.env.VITE_SIMULATE_LAPSED === "true") {
    return { status: "lapsed" }
  }

  // TODO: Replace with real API call
  // const res = await fetch('/api/subscription')
  // if (!res.ok) return { status: 'lapsed' }
  // const data = await res.json()
  // return { status: data.status === 'active' ? 'active' : 'lapsed' }

  return { status: "active" }
}
