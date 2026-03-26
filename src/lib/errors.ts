/**
 * Centralized error classification for user-facing messages.
 *
 * Maps raw API errors (Stripe codes, HTTP status codes, network failures)
 * into a consistent shape that components can render without needing to
 * know what caused the problem.
 *
 * Usage:
 *   const info = classifyError(err, response.status)
 *   // info.title, info.message, info.actionLabel, info.actionHref
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErrorCategory =
  | "auth"       // session expired / unauthenticated
  | "limit"      // usage limit reached
  | "payment"    // payment failure / past_due
  | "network"    // no internet / request timeout
  | "server"     // 5xx from our edge functions
  | "stripe"     // Stripe API / checkout errors
  | "unknown"    // catch-all

export interface AppError {
  category:     ErrorCategory
  title:        string
  message:      string
  /** If present, render a CTA button with this label */
  actionLabel?: string
  /** href for the action button */
  actionHref?:  string
  /**
   * true = service still works despite this error (e.g. Stripe portal failed
   * but user can still use the app).
   * false = the current action is blocked.
   */
  nonBlocking:  boolean
}

// ─── Stripe card-decline codes → human messages ───────────────────────────────

const STRIPE_DECLINE_MESSAGES: Record<string, string> = {
  card_declined:               "Your card was declined. Please use a different card.",
  insufficient_funds:          "Your card has insufficient funds.",
  expired_card:                "Your card has expired. Please update your payment method.",
  incorrect_cvc:               "The card's security code is incorrect.",
  incorrect_number:            "The card number is incorrect.",
  card_velocity_exceeded:      "Too many payment attempts. Please try again later.",
  do_not_honor:                "Your bank declined the payment. Please contact your bank.",
  fraudulent:                  "This payment was flagged as fraudulent. Please contact support.",
  generic_decline:             "Your card was declined. Please try a different card.",
  lost_card:                   "This card has been reported lost. Please use a different card.",
  stolen_card:                 "This card has been reported stolen. Please use a different card.",
  processing_error:            "A processing error occurred. Please try again in a moment.",
  authentication_required:     "Your bank requires additional authentication. Please try again.",
}

// ─── HTTP status → AppError ───────────────────────────────────────────────────

function fromHttpStatus(status: number, serverMessage?: string): AppError {
  switch (status) {
    case 400:
      return {
        category:   "unknown",
        title:      "Bad request",
        message:    serverMessage ?? "Something was wrong with the request. Please try again.",
        nonBlocking: false,
      }
    case 401:
      return {
        category:    "auth",
        title:       "Session expired",
        message:     "Please sign in again to continue.",
        actionLabel: "Sign in",
        actionHref:  "/login",
        nonBlocking: false,
      }
    case 402:
      return {
        category:    "limit",
        title:       "Usage limit reached",
        message:     serverMessage ?? "You've reached your plan's usage limit. Upgrade to continue.",
        actionLabel: "Upgrade plan",
        actionHref:  "/upgrade",
        nonBlocking: false,
      }
    case 403:
      return {
        category:    "auth",
        title:       "Access denied",
        message:     "You don't have permission to do that.",
        nonBlocking: false,
      }
    case 404:
      return {
        category:    "unknown",
        title:       "Not found",
        message:     serverMessage ?? "The requested resource was not found.",
        nonBlocking: false,
      }
    case 429:
      return {
        category:    "network",
        title:       "Too many requests",
        message:     "You're doing that too quickly. Please wait a moment and try again.",
        nonBlocking: false,
      }
    default:
      if (status >= 500) {
        return {
          category:    "server",
          title:       "Server error",
          message:     "Something went wrong on our end. Please try again in a few seconds.",
          nonBlocking: false,
        }
      }
      return {
        category:    "unknown",
        title:       "Unexpected error",
        message:     serverMessage ?? "An unexpected error occurred.",
        nonBlocking: false,
      }
  }
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classify any thrown value into an AppError with friendly copy.
 *
 * @param error       - The caught error (Error, string, unknown)
 * @param statusCode  - HTTP status code, if available
 */
export function classifyError(error: unknown, statusCode?: number): AppError {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error")

  // ── Network errors ───────────────────────────────────────────────────────
  if (
    error instanceof TypeError &&
    (message.includes("fetch") || message.includes("network") || message.includes("Failed to fetch"))
  ) {
    return {
      category:    "network",
      title:       "Connection error",
      message:     "Check your internet connection and try again.",
      nonBlocking: false,
    }
  }

  // ── HTTP status codes (authoritative when present) ───────────────────────
  if (statusCode !== undefined) {
    return fromHttpStatus(statusCode, message)
  }

  // ── Stripe card decline codes in message ─────────────────────────────────
  for (const [code, friendly] of Object.entries(STRIPE_DECLINE_MESSAGES)) {
    if (message.toLowerCase().includes(code.replace(/_/g, " ")) || message.includes(code)) {
      return {
        category:    "payment",
        title:       "Payment declined",
        message:     friendly,
        actionLabel: "Update payment method",
        actionHref:  "/upgrade",
        nonBlocking: false,
      }
    }
  }

  // ── Stripe-specific error patterns ───────────────────────────────────────
  if (
    message.toLowerCase().includes("stripe") ||
    message.toLowerCase().includes("checkout") ||
    message.toLowerCase().includes("payment")
  ) {
    return {
      category:    "stripe",
      title:       "Payment error",
      message:     "There was a problem with the payment service. Please try again.",
      actionLabel: "Try again",
      nonBlocking: true,  // service still accessible; payment action failed
    }
  }

  // ── Auth patterns ─────────────────────────────────────────────────────────
  if (
    message.toLowerCase().includes("not authenticated") ||
    message.toLowerCase().includes("jwt") ||
    message.toLowerCase().includes("session")
  ) {
    return {
      category:    "auth",
      title:       "Session expired",
      message:     "Please sign in again to continue.",
      actionLabel: "Sign in",
      actionHref:  "/login",
      nonBlocking: false,
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    category:    "unknown",
    title:       "Something went wrong",
    message:     "Please try again. If the problem persists, contact support.",
    nonBlocking: false,
  }
}

// ─── Subscription status helpers ─────────────────────────────────────────────

/** User-visible label for a subscription status string. */
export function subscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active:              "Active",
    trialing:            "Trial",
    past_due:            "Payment overdue",
    canceled:            "Canceled",
    incomplete:          "Incomplete",
    incomplete_expired:  "Expired",
    paused:              "Paused",
    unpaid:              "Unpaid",
  }
  return labels[status] ?? status
}

/**
 * Returns copy for a past_due subscription so the user knows what to do.
 *
 * @param graceDaysRemaining  - Days (possibly fractional) left in grace period.
 *                              Pass null when grace has already expired.
 */
export function pastDueMessage(graceDaysRemaining: number | null): {
  title:       string
  message:     string
  actionLabel: string
} {
  if (graceDaysRemaining !== null && graceDaysRemaining > 0) {
    const days = Math.ceil(graceDaysRemaining)
    return {
      title:       "Payment overdue",
      message:     `Your last payment failed. Update your payment method within ${days} day${days !== 1 ? "s" : ""} to avoid service interruption.`,
      actionLabel: "Update payment method",
    }
  }
  return {
    title:       "Access restricted",
    message:     "Your account has been downgraded to the free plan because a payment could not be collected. Upgrade to restore full access.",
    actionLabel: "Restore access",
  }
}
