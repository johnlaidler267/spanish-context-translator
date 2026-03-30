/**
 * Server-side tier/price ID registry — Deno-compatible, no frontend imports.
 *
 * Price IDs must match `src/lib/tiers.ts` (same Stripe Price IDs).
 * Set secrets in Supabase → Edge Functions → Secrets; they override placeholders.
 */

export type TierId = "free" | "pro" | "unlimited"
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
    unlimitedMonthly: stripePriceFromEnv(
      Deno.env.get("STRIPE_PRICE_UNLIMITED_MONTHLY"),
      "price_REPLACE_UNLIMITED_MONTHLY",
    ),
    unlimitedAnnual: stripePriceFromEnv(
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
    [P.unlimitedMonthly]: {
      tierId: "unlimited",
      interval: "monthly",
      label: "Unlimited – Monthly",
    },
    [P.unlimitedAnnual]: {
      tierId: "unlimited",
      interval: "annual",
      label: "Unlimited – Annual",
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
