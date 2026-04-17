/**
 * Server-side tier/price ID registry — Deno-compatible, no frontend imports.
 *
 * Price IDs must match `src/lib/tiers.ts` (same Stripe Price IDs).
 * Set secrets in Supabase → Edge Functions → Secrets; they override placeholders.
 *
 * Legacy: old Unlimited Stripe prices still resolve to tier `pro` so existing
 * subscriptions keep working after the Unlimited product was removed.
 */

export type TierId = "free" | "pro"
export type BillingInterval = "monthly" | "annual"

export interface PriceEntry {
  tierId: TierId
  interval: BillingInterval
  /** Friendly name used in Stripe metadata. */
  label: string
}

/** Trim, strip BOM, strip wrapping quotes (common Dashboard paste mistakes). */
export function normalizeStripePriceId(raw: string): string {
  let v = raw.trim()
  if (v.charCodeAt(0) === 0xfeff) v = v.slice(1).trim()
  for (;;) {
    const q =
      (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    if (!q) break
    v = v.slice(1, -1).trim()
  }
  return v
}

function stripePriceFromEnv(value: string | undefined, placeholder: string): string {
  if (value == null || !value.trim()) return placeholder
  const v = normalizeStripePriceId(value)
  if (v.startsWith("price_")) return v
  return placeholder
}

/**
 * Build allowlist from Deno.env on every call so new Edge secrets apply without
 * waiting for a cold isolate that cached an old module graph.
 */
function buildPriceEntries(): Record<string, PriceEntry> {
  const P = {
    proMonthly: stripePriceFromEnv(Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), "price_REPLACE_PRO_MONTHLY"),
    proAnnual: stripePriceFromEnv(Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"), "price_REPLACE_PRO_ANNUAL"),
    /** Legacy Unlimited product — map to Pro tier. */
    legacyUnlimitedMonthly: stripePriceFromEnv(
      Deno.env.get("STRIPE_PRICE_UNLIMITED_MONTHLY"),
      "price_REPLACE_UNLIMITED_MONTHLY",
    ),
    legacyUnlimitedAnnual: stripePriceFromEnv(
      Deno.env.get("STRIPE_PRICE_UNLIMITED_ANNUAL"),
      "price_REPLACE_UNLIMITED_ANNUAL",
    ),
  }
  return {
    [P.proMonthly]: {
      tierId: "pro",
      interval: "monthly",
      label: "Pro – Monthly",
    },
    [P.proAnnual]: {
      tierId: "pro",
      interval: "annual",
      label: "Pro – Annual",
    },
    [P.legacyUnlimitedMonthly]: {
      tierId: "pro",
      interval: "monthly",
      label: "Pro – Monthly (legacy price)",
    },
    [P.legacyUnlimitedAnnual]: {
      tierId: "pro",
      interval: "annual",
      label: "Pro – Annual (legacy price)",
    },
  }
}

/**
 * Validate a price ID and return its metadata.
 * Returns null if the ID is unknown — caller should respond 400.
 */
export function resolvePriceId(priceId: string): PriceEntry | null {
  const id = normalizeStripePriceId(priceId)
  return buildPriceEntries()[id] ?? null
}

/** Current allowlist keys (from env); call at runtime, not module load. */
export function getAllPriceIds(): string[] {
  return Object.keys(buildPriceEntries())
}

// ─── Tier limits (mirrors src/lib/tiers.ts TierLimits) ───────────────────────
// null = unlimited (no cap). Keep in sync with the frontend config.

/** Pro fair-use — keep in sync with `src/lib/tiers.ts`. */
export const PRO_FAIR_USE_CHARS_PER_MONTH = 4_000_000
export const PRO_FAIR_USE_CHARS_PER_DAY = 500_000

export interface TierLimits {
  textsPerMonth:      number | null
  textsPerDay:        number | null
  chunksPerRequest:   number | null
  pagesPerSubmission: number | null
  savedTranslations:  number | null
  charsPerSubmission: number | null
  charsPerMonth:      number | null
  charsPerDay:        number | null
}

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  free: {
    textsPerMonth:      null,
    textsPerDay:        5,
    chunksPerRequest:   80,
    pagesPerSubmission: null,
    savedTranslations:  0,
    charsPerSubmission: 600,
    charsPerMonth:      null,
    charsPerDay:        null,
  },
  pro: {
    textsPerMonth:      null,
    textsPerDay:        null,
    chunksPerRequest:   null,
    pagesPerSubmission: null,
    savedTranslations:  null,
    charsPerSubmission: null,
    charsPerMonth:      PRO_FAIR_USE_CHARS_PER_MONTH,
    charsPerDay:        PRO_FAIR_USE_CHARS_PER_DAY,
  },
}

export function getTierLimits(tierId: TierId): TierLimits {
  return TIER_LIMITS[tierId] ?? TIER_LIMITS["free"]
}

// ─── Trial days ──────────────────────────────────────────────────────────────
// KEEP IN SYNC with TierConfig.trialDays in src/lib/tiers.ts.

/** Number of free-trial days for first-time subscribers on each tier. */
export const TRIAL_DAYS: Record<TierId, number> = {
  free: 0,
  pro:  7,
}
