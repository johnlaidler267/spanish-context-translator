/**
 * Grace-period helpers for past_due subscriptions.
 *
 * When a payment fails Stripe marks the subscription as `past_due` and begins
 * its smart-retry schedule. During this window we don't want to immediately
 * revoke paid-tier access — the user may fix the payment within hours.
 *
 * PAST_DUE_GRACE_DAYS (default: 3) is the number of days after a subscription
 * first becomes past_due before we start enforcing free-tier limits.
 *
 * Override via the PAST_DUE_GRACE_DAYS environment variable.
 */

/** Number of days past_due before paid-tier access is revoked. */
export const PAST_DUE_GRACE_DAYS: number = (() => {
  const env = Deno.env.get("PAST_DUE_GRACE_DAYS")
  const n = env ? parseInt(env, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 3
})()

/**
 * Returns true if the given ISO timestamp is within the grace window.
 *
 * @param pastDueSince - ISO 8601 string stored in user_subscriptions.past_due_since
 * @param graceDays    - Override the default PAST_DUE_GRACE_DAYS constant.
 */
export function isWithinGracePeriod(
  pastDueSince: string,
  graceDays: number = PAST_DUE_GRACE_DAYS,
): boolean {
  if (graceDays <= 0) return false
  const since   = new Date(pastDueSince).getTime()
  const deadline = since + graceDays * 24 * 60 * 60 * 1000
  return Date.now() < deadline
}

/**
 * Milliseconds remaining in the grace period, or 0 if expired.
 */
export function gracePeriodMsRemaining(
  pastDueSince: string,
  graceDays: number = PAST_DUE_GRACE_DAYS,
): number {
  if (graceDays <= 0) return 0
  const since    = new Date(pastDueSince).getTime()
  const deadline = since + graceDays * 24 * 60 * 60 * 1000
  return Math.max(0, deadline - Date.now())
}

/**
 * Human-readable string: "2 days", "18 hours", "< 1 hour".
 * Returns null when the grace period has already expired.
 */
export function gracePeriodLabel(
  pastDueSince: string,
  graceDays: number = PAST_DUE_GRACE_DAYS,
): string | null {
  const ms = gracePeriodMsRemaining(pastDueSince, graceDays)
  if (ms <= 0) return null
  const hours = ms / (1000 * 60 * 60)
  if (hours < 1)   return "< 1 hour"
  if (hours < 24)  return `${Math.ceil(hours)} hours`
  return `${Math.ceil(hours / 24)} days`
}
