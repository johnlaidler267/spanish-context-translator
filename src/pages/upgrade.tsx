"use client"

import React, { useState, useEffect, useCallback, type ReactNode } from "react"
import {
  ArrowLeft, Check, BookOpen, Zap, Crown,
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
  type TierId,
  type TierConfig,
  type DbBillingInterval,
} from "@/lib/tiers"
import {
  startCheckout,
  openBillingPortal,
  didReturnFromCheckout,
  getReturnedCheckoutSessionId,
  clearCheckoutParam,
  confirmCheckoutSession,
  CheckoutError,
} from "@/lib/checkout"
import {
  cancelSubscription,
  reactivateSubscription,
  downgradeSubscription,
  SubscriptionError,
} from "@/lib/subscription"
import { PlanChangeDialog } from "@/components/plan-change-dialog"
import { supabase } from "@/lib/supabase"
import { useSubscription } from "@/contexts/subscription-context"

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ICONS: Record<TierId, ReactNode> = {
  free:      <BookOpen className="h-5 w-5" />,
  pro:       <Zap className="h-5 w-5" />,
  unlimited: <Crown className="h-5 w-5" />,
}

const TIER_RANK: Record<TierId, number> = { free: 0, pro: 1, unlimited: 2 }

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
    planId:                data.plan_id as TierId,
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
  isProcessing: boolean,
): string {
  if (isProcessing) return "Processing…"
  if (!sub || sub.planId === "free") {
    if (id === "free") return "Current plan"
    return `Subscribe to ${getTier(id).name}`
  }
  if (id === sub.planId) {
    // Current plan — offer reactivation if pending cancellation, otherwise manage
    return sub.cancelAtPeriodEnd ? "Reactivate" : "Manage subscription"
  }
  if (TIER_RANK[id] > TIER_RANK[sub.planId]) return `Upgrade to ${getTier(id).name}`
  if (id === "free") return "Cancel subscription"
  return `Downgrade to ${getTier(id).name}`
}

function buttonVariant(
  id: TierId,
  sub: SubSnapshot | null,
): "default" | "outline" | "secondary" | "destructive" {
  if (!sub) return "outline"
  if (id === sub.planId) {
    return sub.cancelAtPeriodEnd ? "default" : "outline"
  }
  if (id === "free") return "destructive"
  if (getTier(id).highlighted) return "default"
  return "secondary"
}

function isButtonDisabled(id: TierId, sub: SubSnapshot | null, anyProcessing: boolean): boolean {
  if (anyProcessing) return true
  // Free tier with no stripe subscription — already on free, nothing to do
  if (id === "free" && (!sub || !sub.hasStripeSubscription)) return true
  return false
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckoutSuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 mb-8 text-sm font-sans">
      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-green-800 dark:text-green-300">Subscription activated!</p>
        <p className="text-green-700/80 dark:text-green-400/80 mt-0.5">
          Your plan is now active. It may take a moment for all features to unlock.
        </p>
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
}: {
  sub: SubSnapshot
  onReactivate?: () => void
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
            onClick={() => openBillingPortal(window.location.href)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage billing <ExternalLink className="h-3.5 w-3.5" />
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
  return (
    <div className="flex items-center justify-center gap-3 mb-10 font-sans text-sm">
      <button
        onClick={() => onChange("monthly")}
        className={`px-3 py-1 rounded-full transition-colors ${
          interval === "monthly"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange("annual")}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors ${
          interval === "annual"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Annual
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            interval === "annual"
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-primary/10 text-primary"
          }`}
        >
          Save up to 29%
        </span>
      </button>
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
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  const [interval, setInterval] = useState<DbBillingInterval>("monthly")
  const [sub, setSub] = useState<SubSnapshot | null>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [processingTier, setProcessingTier] = useState<TierId | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [confirmingActivation, setConfirmingActivation] = useState(false)
  // Downgrade / cancel confirmation dialog state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)

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
    if (!user) { setSubLoading(false); return }
    let snap = await fetchSubSnapshot(user.id)

    // Fallback: if the DB still says "free", try syncing from Stripe directly.
    if (!snap || snap.planId === "free") {
      try {
        const confirmed = await confirmCheckoutSession()
        snap = {
          planId: confirmed.planId as TierId,
          status: confirmed.status,
          billingInterval: (confirmed.billingInterval as DbBillingInterval) ?? null,
          currentPeriodEnd: confirmed.currentPeriodEnd,
          cancelAtPeriodEnd: false,
          hasStripeSubscription: confirmed.hasStripeSubscription,
          trialEnd: confirmed.trialEnd,
        }
      } catch {
        // No synced Stripe subscription yet — keep the DB snapshot as-is.
      }
    }

    setSub(snap)
    setSubLoading(false)
    // Pre-select the billing interval that matches the user's current plan
    if (snap?.billingInterval) setInterval(snap.billingInterval)
  }, [])

  useEffect(() => { loadSub() }, [loadSub])

  // ── Handle Stripe redirect-back ────────────────────────────────────────────
  useEffect(() => {
    if (!didReturnFromCheckout()) return
    setShowSuccess(true)
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
          const msg = e instanceof CheckoutError ? e.message : "Could not confirm your subscription yet."
          setCheckoutError(msg)
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
  }, [loadSub, recheck])

  // ── Reactivation ───────────────────────────────────────────────────────────
  const handleReactivate = useCallback(async () => {
    setCheckoutError(null)
    setProcessingTier(sub?.planId ?? null)
    try {
      const result = await reactivateSubscription()
      setSub((prev) => prev ? {
        ...prev,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        status:            result.status,
        currentPeriodEnd:  result.currentPeriodEnd,
      } : prev)
      setShowSuccess(true)
    } catch (e) {
      const msg = e instanceof SubscriptionError ? e.message : "Could not reactivate. Please try again."
      setCheckoutError(msg)
    } finally {
      setProcessingTier(null)
    }
  }, [sub])

  // ── Dialog confirm ─────────────────────────────────────────────────────────
  const handleDialogConfirm = useCallback(async () => {
    if (!pendingAction) return
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
      setShowSuccess(true)
    } catch (e) {
      const msg = e instanceof SubscriptionError ? e.message : "Something went wrong. Please try again."
      setCheckoutError(msg)
      setPendingAction(null)
    } finally {
      setDialogLoading(false)
    }
  }, [pendingAction])

  // ── Plan selection ─────────────────────────────────────────────────────────
  const handleSelectPlan = useCallback(
    async (tierId: TierId) => {
      setCheckoutError(null)

      // Reactivation: same plan while cancelAtPeriodEnd is true
      if (sub?.planId === tierId && sub.cancelAtPeriodEnd) {
        handleReactivate()
        return
      }

      // Manage: same plan, no pending cancellation → open billing portal
      if (sub?.planId === tierId && sub.hasStripeSubscription) {
        await openBillingPortal(window.location.href).catch((e) => {
          setCheckoutError(e instanceof CheckoutError ? e.message : "Could not open billing portal")
        })
        return
      }

      const tier = getTier(tierId)
      const priceId =
        interval === "annual"
          ? tier.pricing.annual.stripePriceId
          : tier.pricing.monthly.stripePriceId

      const currentRank = sub ? TIER_RANK[sub.planId] : 0
      const targetRank  = TIER_RANK[tierId]

      // Cancellation: downgrade to free
      if (tierId === "free" && sub?.hasStripeSubscription) {
        setPendingAction({ type: "cancel", targetId: "free", targetPriceId: null })
        return
      }

      // Downgrade: lower paid tier
      if (sub?.hasStripeSubscription && targetRank < currentRank) {
        setPendingAction({ type: "downgrade", targetId: tierId, targetPriceId: priceId })
        return
      }

      // Upgrade or new subscription → Stripe Checkout
      setProcessingTier(tierId)
      try {
        await startCheckout({
          stripePriceId: priceId ?? "",
          successUrl: `${window.location.origin}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl:  window.location.href,
        })
      } catch (e) {
        const msg = e instanceof CheckoutError ? e.message : "Something went wrong. Please try again."
        setCheckoutError(msg)
        setProcessingTier(null)
      }
    },
    [interval, sub, handleReactivate],
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

      <main className="relative z-[1] pb-16 px-4 md:px-6 [overflow-x:clip]">
        <div className="max-w-4xl mx-auto [overflow-x:clip]">

          <BackToHomeLink className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </BackToHomeLink>

          {/* Success banner */}
          {showSuccess && (
            <CheckoutSuccessBanner onDismiss={() => setShowSuccess(false)} />
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
            {confirmingActivation && (
              <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground font-sans">
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming your subscription…
              </p>
            )}
          </div>

          {/* Current plan summary bar */}
          {!subLoading && sub && sub.planId !== "free" && (
            <CurrentPlanSummary sub={sub} onReactivate={handleReactivate} />
          )}

          {/* Billing interval toggle */}
          <BillingToggle interval={interval} onChange={setInterval} />

          {/* Plan grid */}
          {subLoading ? (
            <div className="flex justify-center items-center py-24">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3 md:items-start">
              {TIER_IDS.map((id) => {
                const tier        = getTier(id)
                const isCurrent   = sub?.planId === id
                const isProcessing = processingTier === id
                const anyProcessing = processingTier !== null
                const bullets     = tierBullets(tier)

                const pricing = interval === "annual" ? tier.pricing.annual : tier.pricing.monthly
                const price   = formatPrice(pricing.amountCents)

                return (
                  <Card
                    key={id}
                    className={[
                      "relative bg-card border transition-all duration-200 ease-in-out",
                      isCurrent
                        ? "border-primary/60 ring-1 ring-primary/20"
                        : tier.highlighted
                          ? "border-primary shadow-sm"
                          : "border-border hover:border-border/80",
                    ].join(" ")}
                  >
                    {/* "Your plan" tag */}
                    {isCurrent && (
                      <div className="absolute -top-3 left-4">
                        <span className="px-2.5 py-1 text-xs font-medium bg-background border border-primary/40 text-primary rounded-full">
                          Your plan
                        </span>
                      </div>
                    )}

                    {/* "Most popular" / badge (only when not current) */}
                    {tier.badge && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                          {tier.badge}
                        </span>
                      </div>
                    )}

                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        {TIER_ICONS[id]}
                        <span className="text-sm font-medium font-sans">{tier.name}</span>
                      </div>

                      {/* Price */}
                      <CardTitle className="flex items-baseline gap-1">
                        <span className="text-3xl font-serif text-foreground">{price}</span>
                        <span className="text-sm text-muted-foreground font-sans">/month</span>
                      </CardTitle>

                      {/* Annual savings callout */}
                      {interval === "annual" && pricing.amountCents > 0 && (
                        <p className="text-xs text-muted-foreground font-sans mt-0.5">
                          {formatAnnualMonthlyEquivalent(id)}/mo · billed annually
                          {tier.pricing.annual.savingsPercent > 0 && (
                            <span className="ml-1.5 text-primary font-medium">
                              Save {tier.pricing.annual.savingsPercent}%
                            </span>
                          )}
                        </p>
                      )}

                      <CardDescription className="text-muted-foreground font-sans">
                        {tier.tagline}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0">
                      {/* Feature bullets */}
                      <ul className="space-y-2.5 mb-6">
                        {bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-2 text-sm font-sans">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="text-foreground">{bullet}</span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA button */}
                      <Button
                        onClick={() => handleSelectPlan(id)}
                        disabled={isButtonDisabled(id, sub, anyProcessing)}
                        variant={buttonVariant(id, sub)}
                        className="w-full font-sans"
                      >
                        {isProcessing ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {buttonLabel(id, sub, true)}
                          </span>
                        ) : (
                          buttonLabel(id, sub, false)
                        )}
                      </Button>

                      {/* Trial or cancellation notice */}
                      {isCurrent && sub?.status === "trialing" && sub.trialEnd && (
                        <p className="mt-2.5 text-center text-xs text-primary font-medium font-sans">
                          Trial ends {formatDate(sub.trialEnd)}
                        </p>
                      )}
                      {isCurrent && sub?.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                        <p className="mt-2.5 text-center text-xs text-amber-600 dark:text-amber-400 font-sans">
                          Access until {formatDate(sub.currentPeriodEnd)}
                        </p>
                      )}
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
