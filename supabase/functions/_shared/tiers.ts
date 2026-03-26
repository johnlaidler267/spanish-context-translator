/**
 * Server-side tier/price ID registry — Deno-compatible, no frontend imports.
 *
 * KEEP IN SYNC with src/lib/tiers.ts.
 * When you update price IDs or add tiers there, mirror the change here.
 * This file is the server's authoritative allowlist: any price ID not in
 * PRICE_ENTRIES will be rejected by the edge function.
 */

export type TierId = "free" | "pro" | "unlimited"
export type BillingInterval = "monthly" | "annual"

export interface PriceEntry {
  tierId: TierId
  interval: BillingInterval
  /** Friendly name used in Stripe metadata. */
  label: string
}

/**
 * Allowlist of every valid Stripe Price ID this backend will accept.
 * Free tier has no Stripe price — free downgrades are handled differently.
 */
const PRICE_ENTRIES: Record<string, PriceEntry> = {
  price_REPLACE_PRO_MONTHLY: {
    tierId: "pro",
    interval: "monthly",
    label: "Pro – Monthly",
  },
  price_REPLACE_PRO_ANNUAL: {
    tierId: "pro",
    interval: "annual",
    label: "Pro – Annual",
  },
  price_REPLACE_UNLIMITED_MONTHLY: {
    tierId: "unlimited",
    interval: "monthly",
    label: "Unlimited – Monthly",
  },
  price_REPLACE_UNLIMITED_ANNUAL: {
    tierId: "unlimited",
    interval: "annual",
    label: "Unlimited – Annual",
  },
}

/**
 * Validate a price ID and return its metadata.
 * Returns null if the ID is unknown — caller should respond 400.
 */
export function resolvePriceId(priceId: string): PriceEntry | null {
  return PRICE_ENTRIES[priceId] ?? null
}

/** All valid price IDs as a flat array (useful for Stripe webhook validation). */
export const ALL_PRICE_IDS: string[] = Object.keys(PRICE_ENTRIES)

// ─── Tier limits (mirrors src/lib/tiers.ts TierLimits) ───────────────────────
// null = unlimited (no cap). Keep in sync with the frontend config.

export interface TierLimits {
  textsPerMonth:      number | null
  textsPerDay:        number | null
  chunksPerRequest:   number | null
  pagesPerSubmission: number | null
  savedTranslations:  number | null
  charsPerSubmission: number | null
}

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  free: {
    textsPerMonth:      5,
    textsPerDay:        1,
    chunksPerRequest:   80,
    pagesPerSubmission: 1,
    savedTranslations:  0,
    charsPerSubmission: 1_000,
  },
  pro: {
    textsPerMonth:      50,
    textsPerDay:        null,
    chunksPerRequest:   null,
    pagesPerSubmission: 10,
    savedTranslations:  200,
    charsPerSubmission: 10_000,
  },
  unlimited: {
    textsPerMonth:      null,
    textsPerDay:        null,
    chunksPerRequest:   null,
    pagesPerSubmission: null,
    savedTranslations:  null,
    charsPerSubmission: null,
  },
}

export function getTierLimits(tierId: TierId): TierLimits {
  return TIER_LIMITS[tierId] ?? TIER_LIMITS["free"]
}

// ─── Trial days ──────────────────────────────────────────────────────────────
// KEEP IN SYNC with TierConfig.trialDays in src/lib/tiers.ts.

/** Number of free-trial days for first-time subscribers on each tier. */
export const TRIAL_DAYS: Record<TierId, number> = {
  free:      0,
  pro:       7,
  unlimited: 7,
}
