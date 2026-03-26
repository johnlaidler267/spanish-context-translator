/**
 * Tier configuration — single source of truth for plans, pricing, limits, and feature flags.
 *
 * HOW TO UPDATE:
 *   - Add a new tier: add a key to TierId, add an entry to TIERS, bump CONFIG_VERSION.
 *   - Change a limit: edit the relevant field in TIERS[id].limits, bump CONFIG_VERSION.
 *   - Add a new feature flag: add to TierFeatureFlags, set the value in each tier, use hasFeature().
 *   - Change a Stripe price ID: edit pricing.[interval].stripePriceId — no code changes needed elsewhere.
 *
 * CONFIG_VERSION: semver string. Bump the patch when changing limits/prices; minor when adding
 * features; major when restructuring the shape itself.
 */

export const TIERS_CONFIG_VERSION = "1.0.0"

// ─── ID ──────────────────────────────────────────────────────────────────────

export type TierId = "free" | "pro" | "unlimited"

/** Re-exported here so UI files can import billing interval from one place. */
export type { DbBillingInterval } from "@/lib/db.types"

/** Ordered list — use for rendering plan grids in sequence. */
export const TIER_IDS: TierId[] = ["free", "pro", "unlimited"]

// ─── SHAPES ──────────────────────────────────────────────────────────────────

export interface TierPricingInterval {
  /** Display price in cents (0 for free). */
  amountCents: number
  /** Stripe Price ID for this interval. null on free tier or before Stripe is wired up. */
  stripePriceId: string | null
}

export interface TierPricing {
  monthly: TierPricingInterval
  annual: TierPricingInterval & {
    /** Percentage saved vs. paying monthly for 12 months (0 if no discount). */
    savingsPercent: number
  }
}

/**
 * Hard limits enforced per billing period / per request.
 * null = unlimited (no enforcement).
 * Limits are intentionally separate from feature flags so enforcement
 * logic only depends on this shape — not on display logic.
 */
export interface TierLimits {
  /** Max translation submissions per calendar month. */
  textsPerMonth: number | null
  /**
   * Max translation submissions per calendar day (UTC).
   * Provides a rate-limiting guardrail for free-tier users beyond the monthly cap.
   * null = no daily cap.
   */
  textsPerDay: number | null
  /** Max chunks returned in a single translation request. */
  chunksPerRequest: number | null
  /** Max source-text pages processed per submission. */
  pagesPerSubmission: number | null
  /** Max saved/bookmarked translations stored. */
  savedTranslations: number | null
  /** Max characters accepted per submission. */
  charsPerSubmission: number | null
}

/**
 * Boolean feature gates.
 * true = available on this tier; false = blocked / shown as locked.
 */
export interface TierFeatureFlags {
  articleMode: boolean
  readMode: boolean
  voiceInput: boolean
  exportTranslations: boolean
  apiAccess: boolean
  prioritySupport: boolean
  dedicatedSupport: boolean
}

export interface TierConfig {
  id: TierId
  /** Short display name shown in UI ("Free", "Pro", …). */
  name: string
  /** One-line marketing tagline shown on pricing cards. */
  tagline: string
  /** Longer sentence describing the plan. */
  description: string
  /** Who this plan is for — shown as "Best for …" copy. */
  suggestedUseCase: string
  pricing: TierPricing
  limits: TierLimits
  features: TierFeatureFlags
  /**
   * Number of trial days for first-time subscribers on this tier.
   * 0 = no trial offered (free tier, or if you want to disable trials).
   * Checked by create-checkout-session; ignored for users who have
   * already used a trial (has_used_trial = true).
   */
  trialDays: number
  /**
   * Limit overrides applied ONLY during the trial period.
   * If absent, full tier limits apply during trial (recommended).
   * Useful when you want to give a taste but still cap usage (e.g. 10 texts
   * during trial instead of the full 50).
   */
  trialLimitOverrides?: Partial<TierLimits>
  /** Optional badge text rendered on the pricing card ("Most Popular", "Best Value", …). */
  badge?: string
  /** Whether to visually highlight this card as the recommended tier. */
  highlighted: boolean
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

export const TIERS: Record<TierId, TierConfig> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try it out",
    description: "Get a feel for in-context Spanish translation at no cost.",
    suggestedUseCase: "Casual readers exploring the tool for the first time.",
    pricing: {
      monthly: { amountCents: 0, stripePriceId: null },
      annual:  { amountCents: 0, stripePriceId: null, savingsPercent: 0 },
    },
    limits: {
      textsPerMonth:      5,
      textsPerDay:        1,
      chunksPerRequest:   80,
      pagesPerSubmission: 1,
      savedTranslations:  0,
      charsPerSubmission: 1_000,
    },
    features: {
      articleMode:        true,
      readMode:           false,
      voiceInput:         false,
      exportTranslations: false,
      apiAccess:          false,
      prioritySupport:    false,
      dedicatedSupport:   false,
    },
    trialDays: 0,     // No trial on free — it IS the free tier
    highlighted: false,
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For regular readers",
    description: "Everything you need to read Spanish content daily.",
    suggestedUseCase: "Language learners working through books, articles, and news regularly.",
    pricing: {
      monthly: { amountCents: 900,  stripePriceId: "price_REPLACE_PRO_MONTHLY" },
      annual:  { amountCents: 7_900, stripePriceId: "price_REPLACE_PRO_ANNUAL", savingsPercent: 27 },
    },
    limits: {
      textsPerMonth:      50,
      textsPerDay:        null,
      chunksPerRequest:   null,
      pagesPerSubmission: 10,
      savedTranslations:  200,
      charsPerSubmission: 10_000,
    },
    features: {
      articleMode:        true,
      readMode:           true,
      voiceInput:         true,
      exportTranslations: false,
      apiAccess:          false,
      prioritySupport:    true,
      dedicatedSupport:   false,
    },
    trialDays: 7,
    badge: "Most Popular",
    highlighted: true,
  },

  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    tagline: "No limits, ever",
    description: "Full access to every feature with no usage caps.",
    suggestedUseCase: "Power users, translators, and teams processing high volumes of Spanish text.",
    pricing: {
      monthly: { amountCents: 2_900,  stripePriceId: "price_REPLACE_UNLIMITED_MONTHLY" },
      annual:  { amountCents: 24_900, stripePriceId: "price_REPLACE_UNLIMITED_ANNUAL", savingsPercent: 29 },
    },
    limits: {
      textsPerMonth:      null,
      textsPerDay:        null,
      chunksPerRequest:   null,
      pagesPerSubmission: null,
      savedTranslations:  null,
      charsPerSubmission: null,
    },
    features: {
      articleMode:        true,
      readMode:           true,
      voiceInput:         true,
      exportTranslations: true,
      apiAccess:          true,
      prioritySupport:    true,
      dedicatedSupport:   true,
    },
    trialDays: 7,
    badge: "Best Value",
    highlighted: false,
  },
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Look up a tier config — throws if the ID is unknown (catches typos at runtime). */
export function getTier(id: TierId): TierConfig {
  const tier = TIERS[id]
  if (!tier) throw new Error(`Unknown tier ID: "${id}"`)
  return tier
}

/** Read a single limit for a tier. Returns null when the tier has no cap. */
export function getLimit<K extends keyof TierLimits>(id: TierId, limit: K): TierLimits[K] {
  return getTier(id).limits[limit]
}

/** Check whether a feature flag is enabled on a tier. */
export function hasFeature(id: TierId, flag: keyof TierFeatureFlags): boolean {
  return getTier(id).features[flag]
}

/**
 * Format a cent amount as a display price string.
 * 0 → "$0", 900 → "$9", 2900 → "$29", 7900 → "$79"
 */
export function formatPrice(amountCents: number): string {
  if (amountCents === 0) return "$0"
  const dollars = amountCents / 100
  return dollars % 1 === 0
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`
}

/**
 * Returns the monthly-equivalent cost for an annual plan, formatted.
 * Useful for "billed annually at $X/mo" copy.
 */
export function formatAnnualMonthlyEquivalent(id: TierId): string {
  const cents = getTier(id).pricing.annual.amountCents
  return formatPrice(Math.round(cents / 12))
}

/** True if the tier has no cap on a given limit (null). */
export function isUnlimited(id: TierId, limit: keyof TierLimits): boolean {
  return getLimit(id, limit) === null
}
