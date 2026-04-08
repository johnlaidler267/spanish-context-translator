"use client"

import React, { useState, useEffect, useCallback, type ReactNode } from "react"
import {
  ArrowLeft, Check, BookOpen, GraduationCap,
  Loader2, CheckCircle2, AlertCircle, ExternalLink, RotateCcw,
} from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import type { ReadingTheme } from "@/components/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/theme-storage"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TIER_IDS,
  getTier,
  formatPrice,
  formatAnnualMonthlyEquivalent,
  normalizeTierId,
  type TierId,
  type TierConfig,
  type DbBillingInterval,
} from "@/lib/tiers"
import {
  pricingUiPlanIdFromRow,
  subscriptionRowShowsAsFreePlan,
} from "@/lib/subscription-display"
import {
  startCheckout,
  openBillingPortal,
  didReturnFromCheckout,
  getReturnedCheckoutSessionId,
  clearCheckoutParam,
  confirmCheckoutSession,
  CheckoutError,
  isIdentityRequiredCheckoutError,
} from "@/lib/checkout"
import {
  cancelSubscription,
  reactivateSubscription,
  downgradeSubscription,
  upgradeSubscription,
  SubscriptionError,
  SUBSCRIPTION_IDENTITY_REQUIRED_CODE,
} from "@/lib/subscription"
import { PlanChangeDialog } from "@/components/plan-change-dialog"
import { LegalDocLinks } from "@/components/legal-doc-links"
import { supabase } from "@/lib/supabase"
import { useSubscription } from "@/contexts/subscription-context"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ICONS: Record<TierId, ReactNode> = {
  free: <BookOpen className="h-5 w-5" />,
  pro:  <GraduationCap className="h-5 w-5" />,
}

const TIER_RANK: Record<TierId, number> = { free: 0, pro: 1 }

/**
 * Same press/hover motion as homepage Random / Learn pills
 * ([landing-content-pills.tsx](src/components/landing-content-pills.tsx) `neuPress`).
 */
const UPGRADE_PILL_PRESS =
  "transition-all shadow-[3px_3px_0px_black] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] " +
  "active:shadow-none active:translate-x-[3px] active:translate-y-[3px] " +
  /* dark:shadow + plain hover:shadow-none fight in the cascade — dark:hover/active must be explicit */
  "dark:shadow-[4px_4px_0px_rgba(232,228,220,0.45)] " +
  "dark:hover:shadow-none dark:hover:translate-x-[3px] dark:hover:translate-y-[3px] " +
  "dark:active:shadow-none dark:active:translate-x-[3px] dark:active:translate-y-[3px]"

const UPGRADE_TIER_BTN_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/35 focus-visible:ring-offset-2"

function upgradeTierButtonClassName(
  tierId: TierId,
  variant: "default" | "outline" | "secondary" | "destructive",
): string {
  if (variant === "destructive") {
    return [
      "rounded-md border-[3px] border-destructive font-bold",
      UPGRADE_PILL_PRESS,
      UPGRADE_TIER_BTN_FOCUS,
      "bg-card text-destructive",
      "disabled:opacity-50",
    ].join(" ")
  }
  if (variant === "default") {
    if (tierId === "pro") {
      return [
        "rounded-md border-[3px] border-foreground font-bold",
        UPGRADE_PILL_PRESS,
        UPGRADE_TIER_BTN_FOCUS,
        "bg-[#FDBB2D] text-foreground hover:bg-[#f5b01a]",
        "dark:border-[rgba(234,224,213,0.22)] dark:bg-primary dark:text-primary-foreground dark:hover:bg-[#c97a5a]",
      ].join(" ")
    }
    return [
      "rounded-md border-[3px] border-foreground font-bold",
      UPGRADE_PILL_PRESS,
      UPGRADE_TIER_BTN_FOCUS,
      "bg-primary text-primary-foreground",
    ].join(" ")
  }
  if (
    tierId === "free" &&
    (variant === "outline" || variant === "secondary")
  ) {
    return [
      "rounded-md border-2 border-border/90 bg-card text-foreground font-semibold text-sm",
      UPGRADE_PILL_PRESS,
      UPGRADE_TIER_BTN_FOCUS,
      "hover:border-[#c97a5a]/35 hover:bg-[#faf8f5] dark:hover:border-[#c97a5a]/30 dark:hover:bg-[#22211e]",
      "disabled:opacity-50",
    ].join(" ")
  }
  return [
    "rounded-md border-[3px] border-foreground font-bold",
    UPGRADE_PILL_PRESS,
    UPGRADE_TIER_BTN_FOCUS,
    "bg-card text-foreground hover:bg-muted/40",
    "disabled:opacity-50",
  ].join(" ")
}

// ─── Subscription snapshot from DB ───────────────────────────────────────────

interface SubSnapshot {
  planId:              TierId
  status:              string
  billingInterval:     DbBillingInterval | null
  currentPeriodEnd:    string | null
  cancelAtPeriodEnd:   boolean
  hasStripeSubscription: boolean
  trialEnd:            string | null
}

function pricingUiPlanId(sub: SubSnapshot | null): TierId {
  if (!sub) return "free"
  return pricingUiPlanIdFromRow({
    plan_id:   sub.planId,
    status:    sub.status,
    trial_end: sub.trialEnd,
  })
}

function subRowLike(sub: SubSnapshot): {
  plan_id: string
  status: string
  trial_end: string | null
} {
  return { plan_id: sub.planId, status: sub.status, trial_end: sub.trialEnd }
}

function normalizePriceId(id: string | null | undefined): string {
  return (id ?? "").trim()
}

/** Stripe Price ID from `tiers.ts` for this tier + billing interval. */
function stripePriceIdForTierInterval(tierId: TierId, billing: DbBillingInterval): string | null {
  if (tierId === "free") return null
  const tier = getTier(tierId)
  return billing === "annual" ? tier.pricing.annual.stripePriceId : tier.pricing.monthly.stripePriceId
}

/**
 * Whether this grid card (tier + UI billing toggle) matches the user's active subscription.
 * Uses Stripe price IDs from env so monthly vs annual Pro are distinct.
 */
function isCurrentPlanCard(
  sub: SubSnapshot | null,
  cardTierId: TierId,
  uiInterval: DbBillingInterval,
): boolean {
  if (!sub) return false
  const displayPlan = pricingUiPlanId(sub)
  if (cardTierId === "free") return displayPlan === "free"
  if (displayPlan !== cardTierId) return false
  const billedTier = normalizeTierId(sub.planId)
  if (billedTier === "free") return false
  const activeInterval = sub.billingInterval ?? "monthly"
  const subPrice = normalizePriceId(stripePriceIdForTierInterval(billedTier, activeInterval))
  const cardPrice = normalizePriceId(stripePriceIdForTierInterval(cardTierId, uiInterval))
  if (subPrice && cardPrice && subPrice === cardPrice) return true
  return activeInterval === uiInterval
}

async function fetchSubSnapshot(userId: string): Promise<SubSnapshot | null> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "plan_id, status, billing_interval, current_period_end, cancel_at_period_end, " +
      "stripe_subscription_id, trial_end",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle()

  if (error || !data) return null

  return {
    planId:                normalizeTierId(data.plan_id as string),
    status:                data.status,
    billingInterval:       (data.billing_interval as DbBillingInterval) ?? null,
    currentPeriodEnd:      data.current_period_end ?? null,
    cancelAtPeriodEnd:     data.cancel_at_period_end ?? false,
    hasStripeSubscription: !!data.stripe_subscription_id,
    trialEnd:              data.trial_end ?? null,
  }
}

/** Poll until the webhook has synced any access-granting paid plan. */
async function pollForSyncedPaidPlan(
  userId: string,
  maxAttempts = 8,
  intervalMs = 2_000,
): Promise<SubSnapshot | null> {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, intervalMs))
    const snap = await fetchSubSnapshot(userId)
    if (
      snap &&
      snap.planId !== "free" &&
      (snap.status === "active" || snap.status === "trialing" || snap.hasStripeSubscription)
    ) {
      return snap
    }
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

/** Free plan rows — feature + limit hint (numbers from `getTier("free")` at render). */
function getFreeTierIncludeRows(): { feature: string; limitHint: string }[] {
  const lim = getTier("free").limits
  const day = lim.textsPerDay
  const chars = lim.charsPerSubmission
  const dayLabel =
    day != null ? `${day} submission${day === 1 ? "" : "s"} per day` : "Daily submission cap"
  const charsLabel =
    chars != null
      ? `Up to ${chars.toLocaleString()} characters per submission`
      : "Character limit per submission"
  const charsDay = lim.charsPerUtcDay
  const charsDayHint =
    charsDay != null
      ? `Up to ${charsDay.toLocaleString()} characters total per day (UTC), all submissions combined`
      : null

  return [
    {
      feature: "Article mode — hover any word to understand it",
      limitHint: [charsLabel, charsDayHint].filter(Boolean).join(" · "),
    },
    {
      feature: "Read mode — sentence by sentence, at your pace",
      limitHint:
        chars != null
          ? `Same ${chars.toLocaleString()}-character cap each time`
          : "Same per-submission length cap",
    },
    {
      feature: "Voice transcription",
      limitHint:
        day != null ? `${dayLabel} (all modes combined)` : "Shared daily submission quota",
    },
    {
      feature: "Sample texts to get started",
      limitHint:
        day != null ? `Uses your ${dayLabel}` : "Subject to plan submission limits",
    },
  ]
}

const PRO_TIER_PLUS: string[] = [
  "Unlimited submissions",
  "No character limit — paste full articles",
]

function tierBullets(tier: TierConfig): string[] {
  const { limits, features } = tier
  const bullets: string[] = []

  bullets.push(
    limits.textsPerMonth === null
      ? "Unlimited texts per month"
      : `${limits.textsPerMonth} texts per month`,
  )
  if (limits.textsPerDay !== null)
    bullets.push(`${limits.textsPerDay} submissions per day`)
  if (limits.charsPerUtcDay !== null)
    bullets.push(`Up to ${limits.charsPerUtcDay.toLocaleString()} characters per day total (UTC)`)
  if (limits.charsPerSubmission !== null)
    bullets.push(`Up to ${limits.charsPerSubmission.toLocaleString()} characters per submission`)
  if (limits.savedTranslations === null)
    bullets.push("Unlimited saved translations")
  else if (limits.savedTranslations > 0)
    bullets.push(`${limits.savedTranslations} saved translations`)

  if (features.articleMode)        bullets.push("Article mode")
  if (features.readMode)           bullets.push("Read mode")
  if (features.voiceInput)         bullets.push("Voice input")
  if (features.exportTranslations) bullets.push("Export translations")
  if (features.apiAccess)          bullets.push("API access")
  if (features.prioritySupport)    bullets.push("Priority support")
  if (features.dedicatedSupport)   bullets.push("Dedicated support")

  return bullets
}

function buttonLabel(
  id: TierId,
  sub: SubSnapshot | null,
  uiInterval: DbBillingInterval,
  isProcessing: boolean,
): string {
  if (isProcessing) return "Processing…"
  const plan = pricingUiPlanId(sub)
  if (!sub || plan === "free") {
    if (id === "free") return "Current plan"
    return `Subscribe to ${getTier(id).name}`
  }
  if (id === plan) {
    if (isCurrentPlanCard(sub, id, uiInterval)) {
      return sub.cancelAtPeriodEnd ? "Reactivate" : "Manage subscription"
    }
    return uiInterval === "annual" ? "Switch to annual billing" : "Switch to monthly billing"
  }
  if (TIER_RANK[id] > TIER_RANK[plan]) return `Upgrade to ${getTier(id).name}`
  if (id === "free") return "Cancel subscription"
  return `Downgrade to ${getTier(id).name}`
}

function buttonVariant(
  id: TierId,
  sub: SubSnapshot | null,
  uiInterval: DbBillingInterval,
): "default" | "outline" | "secondary" | "destructive" {
  if (!sub) return "outline"
  const plan = pricingUiPlanId(sub)
  if (id === plan && isCurrentPlanCard(sub, id, uiInterval)) {
    return sub.cancelAtPeriodEnd ? "default" : "outline"
  }
  if (id === "free") return "destructive"
  if (getTier(id).highlighted) return "default"
  return "secondary"
}

function isButtonDisabled(id: TierId, sub: SubSnapshot | null, anyProcessing: boolean): boolean {
  if (anyProcessing) return true
  if (id !== "free") return false
  if (!sub) return true
  if (subscriptionRowShowsAsFreePlan(subRowLike(sub))) return true
  return !sub.hasStripeSubscription
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type SuccessBannerState =
  | { kind: "checkout" }
  | { kind: "upgrade"; tierName: string }
  | { kind: "generic" }

function PlanSuccessBanner({ state, onDismiss }: { state: SuccessBannerState; onDismiss: () => void }) {
  const copy =
    state.kind === "checkout"
      ? {
          title: "Subscription activated!",
          body: "Your plan is now active. It may take a moment for all features to unlock.",
        }
      : state.kind === "upgrade"
        ? {
            title: "Plan updated",
            body: `You're now on ${state.tierName}. Stripe charged your saved card (prorated)—no separate checkout. Receipts and payment method: Billing in Settings.`,
          }
        : {
            title: "Changes saved",
            body: "Your subscription was updated.",
          }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 mb-8 text-sm font-sans">
      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-green-800 dark:text-green-300">{copy.title}</p>
        <p className="text-green-700/80 dark:text-green-400/80 mt-0.5">{copy.body}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-green-600 dark:text-green-400 hover:opacity-70 transition-opacity shrink-0 text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 mb-8 text-sm font-sans">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <p className="flex-1 text-destructive">{message}</p>
      <button
        onClick={onDismiss}
        className="text-destructive hover:opacity-70 transition-opacity shrink-0 text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

function CurrentPlanSummary({
  sub,
  onReactivate,
  billingPortalLoading,
  onManageBilling,
}: {
  sub: SubSnapshot
  onReactivate?: () => void
  /** True while the Stripe Billing Portal session is being created */
  billingPortalLoading?: boolean
  onManageBilling?: () => void | Promise<void>
}) {
  const tier = getTier(sub.planId)
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-5 py-4 mb-7 font-sans text-sm flex flex-wrap gap-x-8 gap-y-2 items-center">
      <div className="flex items-center gap-2 text-foreground font-medium">
        {TIER_ICONS[sub.planId]}
        <span>
          Current plan:
          <strong className="ml-2 text-primary font-bold">{tier.name}</strong>
        </span>
      </div>

      {sub.status === "trialing" && sub.trialEnd && (
        <span className="text-primary font-medium">
          Trial ends {formatDate(sub.trialEnd)}
          {(() => {
            const d = Math.max(0, Math.ceil((new Date(sub.trialEnd).getTime() - Date.now()) / 86_400_000))
            return d <= 3 ? ` (${d} day${d !== 1 ? "s" : ""} left!)` : ` (${d} days left)`
          })()}
        </span>
      )}

      {sub.status !== "trialing" && sub.currentPeriodEnd && !sub.cancelAtPeriodEnd && (
        <span className="text-muted-foreground">
          Renews {formatDate(sub.currentPeriodEnd)}
        </span>
      )}
{/* 
      {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
        <span className="text-amber-600 dark:text-amber-400 font-medium">
          Access until {formatDate(sub.currentPeriodEnd)} · then reverts to Free
        </span>
      )} */}

      <div className="flex items-center gap-4 ml-auto">
        {sub.cancelAtPeriodEnd && onReactivate && (
          <button
            onClick={onReactivate}
            className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reactivate
          </button>
        )}
        {sub.hasStripeSubscription && (
          <button
            type="button"
            disabled={billingPortalLoading}
            onClick={() => void onManageBilling?.()}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {billingPortalLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            )}
            {billingPortalLoading ? "Opening billing…" : "Manage billing"}
          </button>
        )}
      </div>
    </div>
  )
}

function BillingToggle({
  interval,
  onChange,
}: {
  interval: DbBillingInterval
  onChange: (v: DbBillingInterval) => void
}) {
  const pro = getTier("pro")
  const monthlyLabel = formatPrice(pro.pricing.monthly.amountCents)
  const annualPerMo = formatAnnualMonthlyEquivalent("pro")
  const annualPriceNudge = `${monthlyLabel} → ${annualPerMo}/mo`

  return (
    <div className="mb-10 flex flex-col items-center gap-2 font-sans text-sm">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onChange("monthly")}
          aria-pressed={interval === "monthly"}
          className={`px-3 py-1 rounded-full transition-colors ${
            interval === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onChange("annual")}
          aria-pressed={interval === "annual"}
          className={`flex items-center gap-1.5 rounded-full transition-colors ${
            interval === "annual"
              ? "bg-primary text-primary-foreground pl-3 pr-2 py-1"
              : "text-muted-foreground hover:text-foreground px-3 py-1"
          }`}
        >
          <span>Annual</span>
          <span
            className={cn(
              "tabular-nums rounded px-1.5 py-0.5 text-[11px] font-bold leading-none sm:text-xs",
              interval === "annual"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/10 text-primary",
            )}
          >
            {annualPriceNudge}
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PendingAction {
  type: "cancel" | "downgrade"
  targetId: TierId
  targetPriceId: string | null
}

export default function UpgradePage() {
  const { recheck } = useSubscription()
  const { user, openAuthModal } = useAuth()
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  const [interval, setInterval] = useState<DbBillingInterval>("monthly")
  const [sub, setSub] = useState<SubSnapshot | null>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [processingTier, setProcessingTier] = useState<TierId | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<SuccessBannerState | null>(null)
  const [confirmingActivation, setConfirmingActivation] = useState(false)
  // Downgrade / cancel confirmation dialog state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [billingPortalLoading, setBillingPortalLoading] = useState(false)

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  // Mobile overflow unlock
  useEffect(() => {
    document.documentElement.classList.add("mobile-scroll-upgrade")
    return () => document.documentElement.classList.remove("mobile-scroll-upgrade")
  }, [])

  // ── Load subscription ──────────────────────────────────────────────────────
  const loadSub = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSubLoading(false)
      return
    }
    const snap = await fetchSubSnapshot(user.id)

    setSub(snap)
    setSubLoading(false)
    if (snap?.billingInterval) setInterval(snap.billingInterval)

    // Stripe confirm is slow (auth refresh + edge function). Do not block the pricing grid.
    // Only resync when the row says free but still has a Stripe sub (webhook lag / drift).
    // Checkout return with ?session_id= is handled by the dedicated effect below.
    const checkoutReturn = getReturnedCheckoutSessionId()
    const needsStripeResync =
      !checkoutReturn &&
      snap &&
      snap.planId === "free" &&
      snap.hasStripeSubscription

    if (!needsStripeResync) return

    try {
      const confirmed = await confirmCheckoutSession()
      setSub({
        planId: confirmed.planId as TierId,
        status: confirmed.status,
        billingInterval: (confirmed.billingInterval as DbBillingInterval) ?? null,
        currentPeriodEnd: confirmed.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        hasStripeSubscription: confirmed.hasStripeSubscription,
        trialEnd: confirmed.trialEnd,
      })
      if (confirmed.billingInterval === "monthly" || confirmed.billingInterval === "annual") {
        setInterval(confirmed.billingInterval)
      }
    } catch {
      /* keep DB snapshot */
    }
  }, [])

  useEffect(() => { loadSub() }, [loadSub])

  // ── Handle Stripe redirect-back ────────────────────────────────────────────
  useEffect(() => {
    if (!didReturnFromCheckout()) return
    setSuccessBanner({ kind: "checkout" })
    setConfirmingActivation(true)

    // Poll until the webhook has updated the DB, then refresh global subscription state.
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setConfirmingActivation(false)
        return
      }

      try {
        const sessionId = getReturnedCheckoutSessionId()
        try {
          const confirmed = await confirmCheckoutSession(sessionId ?? undefined)
          setSub((prev) => ({
            planId: confirmed.planId as TierId,
            status: confirmed.status,
            billingInterval: (confirmed.billingInterval as DbBillingInterval) ?? prev?.billingInterval ?? null,
            currentPeriodEnd: confirmed.currentPeriodEnd,
            cancelAtPeriodEnd: prev?.cancelAtPeriodEnd ?? false,
            hasStripeSubscription: confirmed.hasStripeSubscription,
            trialEnd: confirmed.trialEnd,
          }))
          if (confirmed.billingInterval === "monthly" || confirmed.billingInterval === "annual") {
            setInterval(confirmed.billingInterval)
          }
        } catch (e) {
          if (isIdentityRequiredCheckoutError(e)) {
            openAuthModal()
          } else {
            const msg =
              e instanceof CheckoutError || (e instanceof Error && e.name === "CheckoutError")
                ? (e as Error).message
                : e instanceof Error
                  ? e.message
                  : "Could not confirm your subscription yet."
            setCheckoutError(msg)
          }
        }

        const updated = await pollForSyncedPaidPlan(user.id)
        if (updated) {
          setSub(updated)
          if (updated.billingInterval) setInterval(updated.billingInterval)
        } else {
          await loadSub()
        }
        await recheck()
        clearCheckoutParam()
      } finally {
        setConfirmingActivation(false)
      }
    })
  }, [loadSub, recheck, openAuthModal])

  // ── Reactivation ───────────────────────────────────────────────────────────
  const handleReactivate = useCallback(async () => {
    setCheckoutError(null)
    if (user?.is_anonymous === true) {
      openAuthModal()
      return
    }
    setProcessingTier(sub?.planId ?? null)
    try {
      const result = await reactivateSubscription()
      setSub((prev) => prev ? {
        ...prev,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        status:            result.status,
        currentPeriodEnd:  result.currentPeriodEnd,
      } : prev)
      setSuccessBanner({ kind: "generic" })
    } catch (e) {
      if (e instanceof SubscriptionError && e.code === SUBSCRIPTION_IDENTITY_REQUIRED_CODE) {
        openAuthModal()
      } else {
        const msg = e instanceof SubscriptionError ? e.message : "Could not reactivate. Please try again."
        setCheckoutError(msg)
      }
    } finally {
      setProcessingTier(null)
    }
  }, [sub, user?.is_anonymous, openAuthModal])

  // ── Dialog confirm ─────────────────────────────────────────────────────────
  const handleDialogConfirm = useCallback(async () => {
    if (!pendingAction) return
    if (user?.is_anonymous === true) {
      openAuthModal()
      setPendingAction(null)
      return
    }
    setDialogLoading(true)
    setCheckoutError(null)
    try {
      let result
      if (pendingAction.type === "cancel") {
        result = await cancelSubscription()
      } else {
        if (!pendingAction.targetPriceId) throw new SubscriptionError("No price ID for downgrade")
        result = await downgradeSubscription(pendingAction.targetPriceId)
      }
      // Update local state immediately (webhook will confirm shortly)
      setSub((prev) => prev ? {
        ...prev,
        planId:            result.planId,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        status:            result.status,
        currentPeriodEnd:  result.currentPeriodEnd,
      } : prev)
      setPendingAction(null)
      setSuccessBanner({ kind: "generic" })
    } catch (e) {
      if (e instanceof SubscriptionError && e.code === SUBSCRIPTION_IDENTITY_REQUIRED_CODE) {
        openAuthModal()
      } else {
        const msg = e instanceof SubscriptionError ? e.message : "Something went wrong. Please try again."
        setCheckoutError(msg)
      }
      setPendingAction(null)
    } finally {
      setDialogLoading(false)
    }
  }, [pendingAction, user?.is_anonymous, openAuthModal])

  // ── Plan selection ─────────────────────────────────────────────────────────
  const handleSelectPlan = useCallback(
    async (tierId: TierId) => {
      setCheckoutError(null)

      const requireBillingIdentity = (): boolean => {
        if (user?.is_anonymous === true) {
          openAuthModal()
          return false
        }
        return true
      }

      // Reactivation: same plan + same price (interval) while cancelAtPeriodEnd is true
      if (
        sub &&
        pricingUiPlanId(sub) === tierId &&
        sub.cancelAtPeriodEnd &&
        isCurrentPlanCard(sub, tierId, interval)
      ) {
        if (!requireBillingIdentity()) return
        handleReactivate()
        return
      }

      // Manage: same plan & same Stripe price, no pending cancellation → billing portal
      if (
        sub &&
        pricingUiPlanId(sub) === tierId &&
        sub.hasStripeSubscription &&
        isCurrentPlanCard(sub, tierId, interval) &&
        !sub.cancelAtPeriodEnd
      ) {
        if (!requireBillingIdentity()) return
        setProcessingTier(tierId)
        try {
          await openBillingPortal(window.location.href)
          // Success: browser navigates to Stripe — do not clear processingTier here
        } catch (e) {
          if (isIdentityRequiredCheckoutError(e)) openAuthModal()
          else setCheckoutError(e instanceof CheckoutError ? e.message : "Could not open billing portal")
          setProcessingTier(null)
        }
        return
      }

      const tier = getTier(tierId)
      const priceId =
        interval === "annual"
          ? tier.pricing.annual.stripePriceId
          : tier.pricing.monthly.stripePriceId

      const currentRank = sub ? TIER_RANK[pricingUiPlanId(sub)] : 0
      const targetRank  = TIER_RANK[tierId]

      // Cancellation: downgrade to free (only when UI treats them as on a paid plan)
      if (
        tierId === "free" &&
        sub?.hasStripeSubscription &&
        pricingUiPlanId(sub) !== "free"
      ) {
        if (!requireBillingIdentity()) return
        setPendingAction({ type: "cancel", targetId: "free", targetPriceId: null })
        return
      }

      // Downgrade: lower paid tier
      if (
        sub?.hasStripeSubscription &&
        pricingUiPlanId(sub) !== "free" &&
        targetRank < currentRank
      ) {
        if (!requireBillingIdentity()) return
        setPendingAction({ type: "downgrade", targetId: tierId, targetPriceId: priceId })
        return
      }

      // Higher tier or same-tier interval switch: update Stripe subscription in place.
      // (create-checkout-session + existing sub only opens the generic Billing Portal — no upgrade.)
      if (
        sub?.hasStripeSubscription &&
        pricingUiPlanId(sub) !== "free" &&
        priceId &&
        (targetRank > currentRank ||
          (tierId === pricingUiPlanId(sub) && !isCurrentPlanCard(sub, tierId, interval)))
      ) {
        if (!requireBillingIdentity()) return
        setProcessingTier(tierId)
        try {
          const result = await upgradeSubscription(priceId)
          setSub((prev) =>
            prev
              ? {
                  ...prev,
                  planId: result.planId,
                  billingInterval: result.billingInterval ?? prev.billingInterval,
                  cancelAtPeriodEnd: result.cancelAtPeriodEnd,
                  status: result.status,
                  currentPeriodEnd: result.currentPeriodEnd,
                }
              : prev,
          )
          setSuccessBanner({
            kind: "upgrade",
            tierName: getTier(result.planId).name,
          })
          await recheck()
        } catch (e) {
          if (e instanceof SubscriptionError && e.code === SUBSCRIPTION_IDENTITY_REQUIRED_CODE) {
            openAuthModal()
          } else {
            const msg =
              e instanceof SubscriptionError ? e.message : "Could not change plan. Please try again."
            setCheckoutError(msg)
          }
        } finally {
          setProcessingTier(null)
        }
        return
      }

      // New subscriber (no active Stripe sub) → Stripe Checkout
      if (!requireBillingIdentity()) return
      setProcessingTier(tierId)
      try {
        await startCheckout({
          stripePriceId: priceId ?? "",
          successUrl: `${window.location.origin}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl:  window.location.href,
        })
      } catch (e) {
        if (isIdentityRequiredCheckoutError(e)) {
          openAuthModal()
        } else {
          const msg = e instanceof CheckoutError ? e.message : "Something went wrong. Please try again."
          setCheckoutError(msg)
        }
        setProcessingTier(null)
      }
    },
    [interval, sub, handleReactivate, recheck, user?.is_anonymous, openAuthModal],
  )

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-app bg-background relative">
      {/* Background image — desktop only */}
      <div
        aria-hidden
        className="hidden md:block"
        style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${theme === "dark" ? "/upgrade-bg-dark.png" : "/upgrade-bg.png"})`,
          backgroundSize: "100% auto",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
          opacity: theme === "dark" ? 0.28 : 0.15,
          filter: theme === "dark" ? "blur(2.3px)" : "none",
          pointerEvents: "none", zIndex: 0,
        }}
      />

      <div className="shrink-0 relative z-[1]">
        <MainHeader theme={theme} onThemeChange={setTheme} variant="stacked" />
      </div>

      <main className="relative z-[1] pb-16 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">

          <BackToHomeLink className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </BackToHomeLink>

          {/* Success banner */}
          {successBanner && (
            <PlanSuccessBanner
              state={successBanner}
              onDismiss={() => setSuccessBanner(null)}
            />
          )}

          {/* Error banner */}
          {checkoutError && (
            <ErrorBanner message={checkoutError} onDismiss={() => setCheckoutError(null)} />
          )}

          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="font-serif text-3xl md:text-4xl font-medium text-foreground">
              Choose your plan
            </h1>
            <p className="mt-2 text-muted-foreground font-sans text-sm">
              {(() => {
                const days = getTier("pro").trialDays
                return days > 0
                  ? `First-time subscribers get a ${days}-day free trial. Cancel anytime.`
                  : "Flexible plans with no long-term commitment. Cancel anytime."
              })()}
            </p>
            {user?.is_anonymous === true && (
              <p className="mt-3 max-w-xl mx-auto rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground text-center leading-relaxed">
                You&apos;re on a <span className="font-medium text-foreground">guest session</span>. Sign in with Google or email below before subscribing so your plan stays with your account.
              </p>
            )}
            {confirmingActivation && (
              <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground font-sans">
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming your subscription…
              </p>
            )}
          </div>

          {/* Current plan summary bar */}
          {!subLoading && sub && pricingUiPlanId(sub) !== "free" && (
            <CurrentPlanSummary
              sub={sub}
              onReactivate={handleReactivate}
              billingPortalLoading={billingPortalLoading}
              onManageBilling={async () => {
                setCheckoutError(null)
                if (user?.is_anonymous === true) {
                  openAuthModal()
                  return
                }
                setBillingPortalLoading(true)
                try {
                  await openBillingPortal(window.location.href)
                } catch (e) {
                  if (isIdentityRequiredCheckoutError(e)) openAuthModal()
                  else {
                    setCheckoutError(
                      e instanceof CheckoutError ? e.message : "Could not open billing portal",
                    )
                  }
                  setBillingPortalLoading(false)
                }
              }}
            />
          )}

          {/* Billing interval toggle */}
          <BillingToggle interval={interval} onChange={setInterval} />

          {/* Plan grid */}
          {subLoading ? (
            <div className="flex justify-center items-center py-24">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
              {TIER_IDS.map((id) => {
                const tier        = getTier(id)
                const isCurrent   = isCurrentPlanCard(sub, id, interval)
                const isProcessing = processingTier === id
                const anyProcessing = processingTier !== null
                const freeIncludeRows = id === "free" ? getFreeTierIncludeRows() : null
                const bullets =
                  id === "free"
                    ? null
                    : id === "pro"
                      ? PRO_TIER_PLUS
                      : tierBullets(tier)

                const pricing = interval === "annual" ? tier.pricing.annual : tier.pricing.monthly
                const nonProPrice = id !== "pro" ? formatPrice(pricing.amountCents) : null

                const bv = buttonVariant(id, sub, interval)
                const isPro = id === "pro"
                const isFree = id === "free"

                return (
                  <Card
                    key={id}
                    className={[
                      "relative flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-lg bg-card text-card-foreground",
                      isPro ? "overflow-visible" : "overflow-hidden",
                      "transition-[transform,box-shadow] duration-200 ease-out",
                      isPro
                        ? [
                            "border-[3px] border-primary z-[1]",
                            "shadow-[6px_6px_0_0_var(--primary)]",
                            "hover:-translate-x-px hover:-translate-y-px",
                            "hover:shadow-[7px_7px_0_0_var(--primary)]",
                            "dark:border-[#c97a5a]/55",
                            "dark:shadow-[5px_5px_0_0_rgba(176,107,86,0.32)]",
                            "dark:hover:border-[#c97a5a]/70",
                            "dark:hover:shadow-[6px_6px_0_0_rgba(201,122,90,0.38)]",
                          ].join(" ")
                        : [
                            "border-2 border-border/80",
                            "shadow-[6px_6px_0_0_color-mix(in_oklab,var(--border)_85%,var(--foreground))]",
                            "hover:-translate-x-px hover:-translate-y-px",
                            "hover:border-border hover:shadow-[7px_7px_0_0_color-mix(in_oklab,var(--border)_85%,var(--foreground))]",
                          ].join(" "),
                    ].join(" ")}
                  >
                    {isPro ? (
                      <div
                        className="h-1.5 w-full rounded-t-lg bg-[#FDBB2D] border-b border-foreground/15 dark:bg-primary dark:border-b-white/10"
                        aria-hidden
                      />
                    ) : null}

                    {isPro && !isCurrent ? (
                      <div
                        className="pointer-events-none absolute right-2 top-2.5 z-[2] sm:right-3 sm:top-3"
                        aria-hidden
                      >
                        <span
                          className={
                            "inline-block max-w-[11rem] text-center rounded-md border-2 border-foreground/25 " +
                            "bg-[#FDBB2D] px-2.5 py-1 text-[10px] font-extrabold font-sans uppercase " +
                            "tracking-wide text-foreground shadow-[2px_2px_0_0_var(--foreground)] " +
                            "dark:border-[rgba(234,224,213,0.28)] dark:bg-primary dark:text-primary-foreground " +
                            "dark:shadow-[2px_2px_0_0_rgba(234,224,213,0.14)] " +
                            "-rotate-2 sm:text-[11px]"
                          }
                        >
                          Most popular
                        </span>
                      </div>
                    ) : null}

                    {/* "Your plan" — quiet on Free so Pro stays the visual hero */}
                    {isCurrent && (
                      <div
                        className={cn(
                          "absolute left-3 z-[1] md:left-4",
                          isPro ? "top-8 md:top-9" : "top-2.5 md:top-3",
                        )}
                      >
                        <span
                          className={
                            isFree
                              ? "px-2 py-0.5 text-[11px] font-medium font-sans rounded-full " +
                                "bg-muted/50 text-muted-foreground border border-border/90"
                              : "px-2.5 py-1 text-xs font-bold font-sans rounded-full " +
                                "bg-[#FDBB2D]/90 text-foreground border-[3px] border-foreground " +
                                "shadow-[2px_2px_0_0_var(--primary)] " +
                                "dark:border-[rgba(234,224,213,0.28)] dark:bg-primary dark:text-primary-foreground " +
                                "dark:shadow-[2px_2px_0_0_rgba(176,107,86,0.45)]"
                          }
                        >
                          Your plan
                        </span>
                      </div>
                    )}

                    <CardHeader
                      className={cn(
                        "px-6 pb-4",
                        isCurrent ? "pt-12" : isPro ? "pt-5" : "pt-6",
                      )}
                    >
                      {/*
                        Reserve right padding only on the title row — "Most popular" floats top-right.
                        Applying it to the whole header was narrowing the price / annual blurb.
                      */}
                      <div
                        className={cn(
                          "flex items-center gap-3 mb-3 flex-wrap",
                          isFree ? "text-muted-foreground" : "text-foreground",
                          isPro && !isCurrent && "pr-[7.5rem] sm:pr-[8rem]",
                        )}
                      >
                        <span
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-card " +
                            (isPro
                              ? "border-primary text-primary dark:border-[#c97a5a]/70 dark:text-[rgba(234,224,213,0.88)]"
                              : "border-border text-muted-foreground")
                          }
                          aria-hidden
                        >
                          {TIER_ICONS[id]}
                        </span>
                        <span
                          className={
                            "min-w-0 font-sans tracking-tight " +
                            (isPro ? "text-lg md:text-xl font-extrabold" : "text-base font-semibold")
                          }
                        >
                          {isPro ? "Pro Plan" : tier.name}
                        </span>
                      </div>

                      {/* Price */}
                      {id === "pro" ? (
                        <>
                          <CardTitle className="flex items-baseline gap-1">
                            <span className="text-4xl font-black font-sans tracking-tight text-foreground">
                              {formatPrice(
                                interval === "annual"
                                  ? tier.pricing.annual.amountCents
                                  : tier.pricing.monthly.amountCents,
                              )}
                            </span>
                            <span className="text-sm text-muted-foreground font-sans">
                              {interval === "annual" ? "/year" : "/month"}
                            </span>
                          </CardTitle>
                          {interval === "monthly" ? (
                            <p className="text-sm text-muted-foreground font-sans mt-1">
                              or {formatPrice(tier.pricing.annual.amountCents)}/yr — two months free
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground font-sans mt-0.5 md:whitespace-nowrap">
                              {formatAnnualMonthlyEquivalent("pro")}/mo · billed annually — two months free
                              {tier.pricing.annual.savingsPercent > 0 && (
                                <span className="ml-1.5 text-primary font-medium">
                                  {" "}
                                  (Save {tier.pricing.annual.savingsPercent}%)
                                </span>
                              )}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <CardTitle className="flex items-baseline gap-1">
                            <span className="text-3xl font-extrabold font-sans tracking-tight text-foreground/90">
                              {nonProPrice}
                            </span>
                            <span className="text-xs text-muted-foreground font-sans font-medium">/month</span>
                          </CardTitle>

                          {interval === "annual" && pricing.amountCents > 0 && (
                            <p className="text-xs text-muted-foreground font-sans mt-0.5 md:whitespace-nowrap">
                              {formatAnnualMonthlyEquivalent(id)}/mo · billed annually
                              {tier.pricing.annual.savingsPercent > 0 && (
                                <span className="ml-1.5 text-primary font-medium">
                                  {" "}
                                  Save {tier.pricing.annual.savingsPercent}%
                                </span>
                              )}
                            </p>
                          )}
                        </>
                      )}

                      {tier.tagline ? (
                        <CardDescription className="text-muted-foreground font-sans">
                          {tier.tagline}
                        </CardDescription>
                      ) : null}
                    </CardHeader>

                    <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
                      {id === "free" && (
                        <p className="text-xs font-semibold font-sans text-muted-foreground uppercase tracking-wide mb-3">
                          Includes
                        </p>
                      )}
                      {id === "pro" && (
                        <p className="text-xs font-semibold font-sans text-muted-foreground uppercase tracking-wide mb-3">
                          Everything in free, plus
                        </p>
                      )}
                      {/* Feature bullets — flex-1 so CTAs align across cards */}
                      <ul
                        className={cn(
                          "min-h-0 flex-1",
                          freeIncludeRows ? "space-y-3.5" : "space-y-2.5",
                        )}
                      >
                        {freeIncludeRows
                          ? freeIncludeRows.map((row) => (
                              <li key={row.feature} className="flex items-start gap-2.5 text-sm font-sans">
                                <span
                                  className={cn(
                                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                                    "border-border text-muted-foreground",
                                  )}
                                  aria-hidden
                                >
                                  <Check className="h-3 w-3 stroke-[3]" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-foreground/90 leading-snug">{row.feature}</p>
                                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/85 font-normal">
                                    {row.limitHint}
                                  </p>
                                </div>
                              </li>
                            ))
                          : (bullets ?? []).map((bullet) => (
                              <li key={bullet} className="flex items-start gap-2.5 text-sm font-sans">
                                <span
                                  className={cn(
                                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                                    isPro
                                      ? "border-foreground text-foreground dark:border-[#c97a5a]/55 dark:text-[rgba(234,224,213,0.82)]"
                                      : "border-border text-muted-foreground",
                                  )}
                                  aria-hidden
                                >
                                  <Check className="h-3 w-3 stroke-[3]" />
                                </span>
                                <span className={isFree ? "text-foreground/85" : "text-foreground"}>
                                  {bullet}
                                </span>
                              </li>
                            ))}
                      </ul>

                      <div className="mt-auto flex flex-col gap-4 pt-4">
                        <Button
                          onClick={() => handleSelectPlan(id)}
                          disabled={isButtonDisabled(id, sub, anyProcessing)}
                          variant={bv}
                          className={["w-full font-sans", upgradeTierButtonClassName(id, bv)].join(" ")}
                        >
                          {isProcessing ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {buttonLabel(id, sub, interval, true)}
                            </span>
                          ) : (
                            buttonLabel(id, sub, interval, false)
                          )}
                        </Button>

                        {isCurrent && sub?.status === "trialing" && sub.trialEnd && (
                          <p className="text-center text-xs text-primary font-medium font-sans">
                            Trial ends {formatDate(sub.trialEnd)}
                          </p>
                        )}
                        {isCurrent && sub?.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                          <p className="text-center text-xs text-amber-600 dark:text-amber-400 font-sans">
                            Access until {formatDate(sub.currentPeriodEnd)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Footer note */}
          <p className="mt-10 text-center text-xs text-muted-foreground font-sans">
            Payments processed securely by Stripe. You can cancel or change plans at any time.
            <span className="block mt-2">
              <LegalDocLinks className="text-muted-foreground" />
            </span>
          </p>

        </div>
      </main>

      {/* Downgrade / cancellation confirmation dialog */}
      {pendingAction && sub && (
        <PlanChangeDialog
          open={!!pendingAction}
          action={pendingAction.type}
          currentTier={getTier(sub.planId)}
          targetTier={getTier(pendingAction.targetId)}
          periodEnd={sub.currentPeriodEnd}
          loading={dialogLoading}
          onConfirm={handleDialogConfirm}
          onCancel={() => !dialogLoading && setPendingAction(null)}
        />
      )}
    </div>
  )
}
