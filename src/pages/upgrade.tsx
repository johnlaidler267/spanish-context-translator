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
  PRO_FAIR_USE_CHARS_PER_DAY,
  PRO_FAIR_USE_CHARS_PER_MONTH,
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
import { SiteFooter } from "@/components/site-footer"
import { supabase } from "@/lib/supabase"
import { invokeSubscriptionRecheck } from "@/contexts/subscription-context"
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
        "h-14 rounded-[14px] border-0 px-4 text-lg font-bold",
        "shadow-[0_8px_16px_rgba(201,122,90,0.28)] transition-colors",
        UPGRADE_TIER_BTN_FOCUS,
        "bg-[#cf8778] text-white hover:bg-[#c27768]",
        "dark:bg-primary dark:text-primary-foreground dark:hover:bg-[#c97a5a]",
      ].join(" ")
    }
    return [
      "h-14 rounded-[14px] border-2 border-[#d89b8d] bg-transparent px-4 text-lg font-bold",
      UPGRADE_TIER_BTN_FOCUS,
      "text-[#c07f71] hover:bg-[#f4ecdf]",
    ].join(" ")
  }
  if (
    tierId === "free" &&
    (variant === "outline" || variant === "secondary")
  ) {
    return [
      "h-14 rounded-[14px] border-2 border-[#d89b8d] bg-transparent px-4 text-lg font-bold",
      UPGRADE_TIER_BTN_FOCUS,
      "text-[#c07f71] hover:bg-[#f4ecdf] disabled:opacity-50",
    ].join(" ")
  }
  return [
    "h-14 rounded-[14px] border-2 border-[#d89b8d] bg-transparent px-4 text-lg font-bold",
    UPGRADE_TIER_BTN_FOCUS,
    "text-[#c07f71] hover:bg-[#f4ecdf] disabled:opacity-50",
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
  return [
    {
      feature: "Article mode — hover any word to understand it",
      limitHint: charsLabel,
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
  `Generous fair use: up to ${PRO_FAIR_USE_CHARS_PER_MONTH.toLocaleString()} characters per billing period and ${PRO_FAIR_USE_CHARS_PER_DAY.toLocaleString()} per UTC day`,
  "No fixed cap per paste — paste full articles within fair use",
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
  const annualSavingsPercent = pro.pricing.annual.savingsPercent

  return (
    <div className="mb-10 flex justify-center font-sans text-sm">
      <div className="inline-flex items-center rounded-[18px] bg-[#ece9e3] p-1 dark:bg-[#2a2926]">
          <button
            type="button"
            onClick={() => onChange("monthly")}
            aria-pressed={interval === "monthly"}
            className={cn(
              "rounded-[14px] px-6 py-2 font-semibold transition-colors",
              interval === "monthly"
                ? "bg-[#c97a5a] text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                : "text-[#76736d] hover:text-[#4d4a45] dark:text-[#9b968c] dark:hover:text-[#c9c4ba]",
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => onChange("annual")}
            aria-pressed={interval === "annual"}
            className={cn(
              "inline-flex items-center gap-2 rounded-[14px] px-6 py-2 font-semibold transition-colors",
              interval === "annual"
                ? "bg-[#c97a5a] text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                : "text-[#76736d] hover:text-[#4d4a45] dark:text-[#9b968c] dark:hover:text-[#c9c4ba]",
            )}
          >
            <span>Annual</span>
            {annualSavingsPercent > 0 && (
              <span className="pointer-events-none rounded-full bg-[#f2c66d] px-2 py-0.5 text-xs font-semibold leading-none text-[#5d3a20] whitespace-nowrap">
                Save {annualSavingsPercent}%
              </span>
            )}
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
        await invokeSubscriptionRecheck()
        clearCheckoutParam()
      } finally {
        setConfirmingActivation(false)
      }
    })
  }, [loadSub, openAuthModal])

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
          await invokeSubscriptionRecheck()
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
    [interval, sub, handleReactivate, user?.is_anonymous, openAuthModal],
  )

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-app bg-background relative">
      <div className="shrink-0 relative z-[1]">
        <MainHeader theme={theme} onThemeChange={setTheme} variant="stacked" />
      </div>

      <main className="relative z-[1] px-4 md:px-6">
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
              <div className="mt-4 mx-auto max-w-xl rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-left">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                  You&apos;re on a guest session.
                </p>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                  Sign in before subscribing so your paid plan is linked to your account and won&apos;t be lost.
                </p>
                <Button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="mt-3 h-8 rounded-md border-2 border-foreground bg-background px-3 text-xs font-semibold text-foreground hover:bg-background/90 dark:border-[rgba(234,224,213,0.28)]"
                >
                  Sign in
                </Button>
              </div>
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
                      "relative flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-[18px] text-card-foreground",
                      isPro ? "overflow-visible" : "overflow-hidden",
                      "transition-[transform,box-shadow] duration-200 ease-out",
                      isPro
                        ? [
                            "z-[1] border-2 border-[#d49889] bg-[#f7f1e6]",
                            "shadow-[0_12px_24px_rgba(201,122,90,0.22)]",
                            "hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(201,122,90,0.26)]",
                            "dark:border-[#c97a5a]/55 dark:bg-card",
                          ].join(" ")
                        : [
                            "border border-[#e6dccc] bg-[#f7f1e6]",
                            "shadow-[0_6px_14px_rgba(76,56,39,0.08)]",
                            "hover:-translate-y-[1px] hover:shadow-[0_10px_20px_rgba(76,56,39,0.12)]",
                            "dark:border-border/80 dark:bg-card",
                          ].join(" "),
                    ].join(" ")}
                  >
                    {isPro ? (
                      <div
                        className="pointer-events-none absolute left-1/2 top-0 z-[2] -translate-x-1/2 -translate-y-1/2"
                        aria-hidden
                      >
                        <span
                          className={
                            "inline-flex items-center rounded-full border border-[#d38f80] " +
                            "bg-[#cf8778] px-5 py-1.5 text-xs font-extrabold font-sans uppercase " +
                            "tracking-[0.16em] text-[#fff2ec] shadow-[0_4px_10px_rgba(201,122,90,0.28)] " +
                            "dark:border-[rgba(234,224,213,0.28)] dark:bg-primary dark:text-primary-foreground"
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
                        "px-9 pb-4",
                        isCurrent ? "pt-11" : isPro ? "pt-9" : "pt-8",
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
                        )}
                      >
                        <span
                          className={
                            "min-w-0 font-sans tracking-tight " +
                            (isPro
                              ? "text-[2rem] md:text-[2.2rem] font-bold text-[#cb7d6e] dark:text-foreground"
                              : "text-[2rem] md:text-[2.2rem] font-bold text-foreground")
                          }
                        >
                          {isPro ? "Pro" : tier.name}
                        </span>
                      </div>

                      {/* Price */}
                      {id === "pro" ? (
                        <>
                          <CardTitle className="flex items-baseline gap-1">
                            <span className="text-[4.2rem] leading-none font-black font-sans tracking-tight text-[#3a2b24] dark:text-foreground">
                              {formatPrice(
                                interval === "annual"
                                  ? tier.pricing.annual.amountCents
                                  : tier.pricing.monthly.amountCents,
                              )}
                            </span>
                            <span className="text-xl font-semibold text-[#5a4b42] dark:text-muted-foreground">
                              {interval === "annual" ? "/year" : "/month"}
                            </span>
                          </CardTitle>
                          {tier.trialDays > 0 && interval === "monthly" ? (
                            <p className="mt-1 text-lg font-medium text-[#cf8778] dark:text-primary">
                              {tier.trialDays}-day free trial included
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground font-sans mt-1 md:whitespace-nowrap">
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
                            <span className="text-[4.2rem] leading-none font-black font-sans tracking-tight text-[#3a2b24] dark:text-foreground">
                              {nonProPrice}
                            </span>
                            <span className="text-xl font-semibold text-[#5a4b42] dark:text-muted-foreground">
                              /forever
                            </span>
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
                        <CardDescription className="mt-1 text-base font-medium text-[#5f5450] dark:text-muted-foreground">
                          {tier.tagline}
                        </CardDescription>
                      ) : null}
                    </CardHeader>

                    <CardContent className="flex min-h-0 flex-1 flex-col px-9 pt-1">
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
                                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                    "text-[#cf8778] dark:text-primary",
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
                                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                    isPro
                                      ? "text-[#cf8778] dark:text-primary"
                                      : "text-[#cf8778] dark:text-primary",
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
          </p>
        </div>

        <SiteFooter
          className="mt-6 font-sans"
          bleedPadClassName="-mx-4 md:-mx-6 px-4 md:px-6"
          contentMaxClassName="max-w-4xl mx-auto"
        />
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
