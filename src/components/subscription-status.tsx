"use client"

/**
 * SubscriptionStatus
 *
 * Self-loading component — fetches subscription + usage on mount.
 * Can optionally receive a pre-seeded UsageTracker to skip the usage fetch.
 *
 * Usage:
 *   // Standalone (loads everything itself)
 *   <SubscriptionStatus />
 *
 *   // Embedded with shared tracker (avoids double fetch)
 *   <SubscriptionStatus tracker={trackerRef.current} />
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { Link } from "react-router-dom"
import {
  BookOpen, Zap, CalendarCheck2,
  AlertTriangle, RefreshCw, Loader2, ArrowUpRight, RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getTier, formatPrice, type TierId } from "@/lib/tiers"
import type { UsageMetric, UsageCounters, UsageLimits, UsageTracker } from "@/lib/usage"
import {
  METRIC_CONFIG,
  ALL_METRICS,
  getLimitStatus,
  fetchCurrentUsage,
  USAGE_UPDATED_EVENT,
} from "@/lib/usage"
import { openBillingPortal, CheckoutError } from "@/lib/checkout"
import { reactivateSubscription, SubscriptionError } from "@/lib/subscription"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { PaymentErrorBanner } from "@/components/payment-error-banner"

// ─── Display config ───────────────────────────────────────────────────────────

/**
 * Which metrics to render as usage bars, in display order.
 * Only monthly-accumulating metrics make sense here — per-request limits
 * are shown separately as plan facts, not progress.
 */
const MONTHLY_BAR_METRICS: UsageMetric[] = ["texts_submitted"]

/**
 * Daily-rate metrics shown as progress bars only when the tier has a cap.
 * Currently only the free tier has a daily text limit.
 */
const DAILY_BAR_METRICS: UsageMetric[] = [
  "texts_submitted_today",
  "chars_processed_today",
]

/** Per-request limits shown as plain facts ("up to X per submission"). */
const PER_REQUEST_FACTS: { metric: UsageMetric; label: string }[] = [
  { metric: "chars_processed", label: "Characters per submission" },
  { metric: "pages_processed", label: "Pages per submission" },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubData {
  planId:              TierId
  status:              string
  currentPeriodEnd:    string | null
  cancelAtPeriodEnd:   boolean
  hasStripeSubscription: boolean
  trialEnd:            string | null
  pastDueSince:        string | null
}

interface LoadedState {
  sub:      SubData | null
  counters: UsageCounters
  limits:   UsageLimits
  period:   { start: string; end: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  })
}

function zeroCounts(): UsageCounters {
  return Object.fromEntries(ALL_METRICS.map(m => [m, 0])) as UsageCounters
}
function nullLimits(): UsageLimits {
  return Object.fromEntries(ALL_METRICS.map(m => [m, null])) as UsageLimits
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TIER_ICONS: Record<TierId, React.ReactNode> = {
  free: <BookOpen className="h-4 w-4" />,
  pro:  <Zap className="h-4 w-4" />,
}

function StatusPill({ status }: { status: string }) {
  const isGood = status === "active" || status === "trialing"
  const isBad  = status === "past_due" || status === "canceled" ||
                 status === "incomplete" || status === "incomplete_expired"

  const colorClass = isGood
    ? "bg-green-500/12 text-green-700 dark:text-green-400"
    : isBad
    ? "bg-destructive/10 text-destructive"
    : "bg-amber-500/12 text-amber-700 dark:text-amber-400"

  const dotClass = isGood
    ? "bg-green-500"
    : isBad
    ? "bg-destructive"
    : "bg-amber-500"

  const label = status === "trialing" ? "Trial"
    : status === "past_due" ? "Payment overdue"
    : status.replace(/_/g, " ")

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium font-sans",
      colorClass,
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  )
}

function DaysRemaining({ periodEnd, cancelAtPeriodEnd, isTrialing }: {
  periodEnd: string
  cancelAtPeriodEnd: boolean
  isTrialing?: boolean
}) {
  const days  = daysUntil(periodEnd)
  const date  = formatDate(periodEnd)
  const urgent = days <= 3

  const label = isTrialing
    ? "Trial ends"
    : cancelAtPeriodEnd
      ? "Cancels"
      : "Renews"

  const isAmber = isTrialing ? urgent : (cancelAtPeriodEnd || urgent)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-sans",
        isAmber ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "inline-block px-1.5 py-0.5 rounded font-medium",
          isAmber ? "bg-amber-500/10" : "bg-muted/60",
        )}
      >
        {days}d
      </span>
      {label} {date}
    </span>
  )
}

/** Prominent banner shown during a trial — countdown + CTA to add a payment method. */
function TrialCountdown({ trialEnd, planName }: { trialEnd: string; planName: string }) {
  const days    = daysUntil(trialEnd)
  const date    = formatDate(trialEnd)
  const isUrgent = days <= 3
  const dayWord  = days === 1 ? "day" : "days"

  return (
    <div
      className={cn(
        "px-5 py-3 flex items-start gap-3 text-sm font-sans",
        isUrgent
          ? "bg-amber-500/8 border-b border-amber-500/20"
          : "bg-primary/5 border-b border-primary/10",
      )}
    >
      <AlertTriangle className={cn(
        "h-4 w-4 shrink-0 mt-0.5",
        isUrgent ? "text-amber-600 dark:text-amber-400" : "text-primary",
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium leading-snug",
          isUrgent ? "text-amber-700 dark:text-amber-300" : "text-foreground",
        )}>
          {days === 0
            ? `Your ${planName} trial ends today`
            : `${days} ${dayWord} left in your ${planName} trial`}
        </p>
        <p className={cn(
          "text-xs mt-0.5",
          isUrgent ? "text-amber-600/80 dark:text-amber-400/80" : "text-muted-foreground",
        )}>
          {isUrgent
            ? `Add a payment method before ${date} to avoid losing access.`
            : `Your trial ends ${date}. Add a payment method to keep full access.`}
        </p>
      </div>
      <Link
        to="/upgrade"
        className={cn(
          "shrink-0 text-xs font-medium underline underline-offset-2 hover:opacity-75",
          isUrgent ? "text-amber-700 dark:text-amber-300" : "text-primary",
        )}
      >
        Add card →
      </Link>
    </div>
  )
}

interface UsageBarProps {
  metric:       UsageMetric
  counters:     UsageCounters
  limits:       UsageLimits
  /** Optional suffix appended to the metric label (e.g. " today"). */
  labelSuffix?: string
}

function UsageBar({ metric, counters, limits, labelSuffix = "" }: UsageBarProps) {
  const status = getLimitStatus(metric, counters, limits)
  const label  = (METRIC_CONFIG[metric]?.label ?? metric) + labelSuffix

  // Don't render a bar for unlimited metrics
  if (status.limit === null) {
    return (
      <div className="flex items-center justify-between text-sm font-sans">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">
          {status.current.toLocaleString()}
          <span className="text-muted-foreground ml-1">/ ∞</span>
        </span>
      </div>
    )
  }

  const pct    = Math.min(100, Math.round((status.ratio ?? 0) * 100))
  const isWarn = status.nearLimit && !status.exceeded
  const isOver = status.exceeded

  const barColor = isOver
    ? "bg-destructive"
    : isWarn
      ? "bg-amber-500"
      : "bg-primary/70"

  const trackColor = isOver
    ? "bg-destructive/15"
    : isWarn
      ? "bg-amber-500/15"
      : "bg-muted/60"

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-sm font-sans leading-tight">
        <span
          className={cn(
            "flex items-center gap-1.5",
            isOver ? "text-destructive" : isWarn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {(isWarn || isOver) && <AlertTriangle className="h-3 w-3 shrink-0" />}
          {label}
        </span>
        <span className={cn(
          "tabular-nums",
          isOver ? "text-destructive font-medium" : isWarn ? "text-amber-600 dark:text-amber-400" : "text-foreground",
        )}>
          {status.current.toLocaleString()}
          <span className="text-muted-foreground">/{status.limit.toLocaleString()}</span>
        </span>
      </div>

      {/* Track */}
      <div className={cn("h-1 w-full rounded-full overflow-hidden", trackColor)}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={status.current}
          aria-valuemax={status.limit}
          aria-label={`${label}: ${status.current} of ${status.limit}`}
        />
      </div>
    </div>
  )
}

function WarningBanner({ warned, exceeded }: {
  warned:   UsageMetric[]
  exceeded: UsageMetric[]
}) {
  if (warned.length === 0 && exceeded.length === 0) return null

  const isBlocked = exceeded.length > 0
  const metrics   = isBlocked ? exceeded : warned
  const names     = metrics.map(m => METRIC_CONFIG[m]?.label ?? m).join(", ")

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm font-sans",
        isBlocked
          ? "bg-destructive/8 border border-destructive/25 text-destructive"
          : "bg-amber-500/8 border border-amber-500/25 text-amber-700 dark:text-amber-400",
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">
          {isBlocked ? "Limit reached: " : "Approaching limit: "}
        </span>
        {names}.{" "}
        {isBlocked ? (
          <Link to="/upgrade" className="underline underline-offset-2 hover:opacity-80">
            Upgrade to continue →
          </Link>
        ) : (
          <Link to="/upgrade" className="underline underline-offset-2 hover:opacity-80">
            Consider upgrading
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useSubscriptionData(tracker?: UsageTracker) {
  const [state, setState] = useState<LoadedState>({
    sub: null, counters: zeroCounts(), limits: nullLimits(), period: null,
  })
  const [loading, setLoading] = useState(true)
  const [error,   setError  ] = useState<string | null>(null)
  /** After first successful load, refreshes stay in the background (no skeleton flash). */
  const hasLoadedOnceRef = useRef(false)

  const load = useCallback(async () => {
    const showBlockingLoad = !hasLoadedOnceRef.current
    if (showBlockingLoad) {
      setLoading(true)
      setError(null)
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      // Subscription row
      const { data: subRow } = await supabase
        .from("user_subscriptions")
        .select(
          "plan_id, status, current_period_end, cancel_at_period_end, " +
          "stripe_subscription_id, billing_interval, trial_end, past_due_since",
        )
        .eq("user_id", user.id)
        .is("archived_at", null)
        .maybeSingle()

      const sub: SubData | null = subRow
        ? {
            planId:               subRow.plan_id as TierId,
            status:               subRow.status,
            currentPeriodEnd:     subRow.current_period_end ?? null,
            cancelAtPeriodEnd:    subRow.cancel_at_period_end ?? false,
            hasStripeSubscription: !!subRow.stripe_subscription_id,
            trialEnd:             subRow.trial_end ?? null,
            pastDueSince:         subRow.past_due_since ?? null,
          }
        : null

      // Usage counters — use tracker if provided to skip a network call
      if (tracker) {
        await tracker.refresh()
        setState({
          sub,
          counters: tracker.counters,
          limits:   tracker.limits,
          period:   tracker.period,
        })
      } else {
        const usage = await fetchCurrentUsage()
        setState({
          sub,
          counters: usage.counters,
          limits:   usage.limits,
          period:   usage.period,
        })
      }
      hasLoadedOnceRef.current = true
    } catch (e) {
      if (!hasLoadedOnceRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load subscription")
      }
    } finally {
      setLoading(false)
    }
  }, [tracker])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onUsageUpdated = () => {
      void load()
    }
    window.addEventListener(USAGE_UPDATED_EVENT, onUsageUpdated)
    return () => window.removeEventListener(USAGE_UPDATED_EVENT, onUsageUpdated)
  }, [load])

  /* Refresh when tab becomes visible (cross-tab submits, return-to-settings). */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [load])

  return { state, loading, error, reload: load }
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SubscriptionStatusProps {
  /** Pre-seeded tracker from the parent (skips the usage fetch). */
  tracker?: UsageTracker
  /** Extra classes for the outer container. */
  className?: string
  /** Compact variant — smaller padding, no per-request facts section. */
  compact?: boolean
}

export function SubscriptionStatus({
  tracker,
  className,
  compact = false,
}: SubscriptionStatusProps) {
  const { state, loading, error, reload } = useSubscriptionData(tracker)
  const [portalLoading,      setPortalLoading     ] = useState(false)
  const [portalError,        setPortalError        ] = useState<string | null>(null)
  const [reactivateLoading,  setReactivateLoading ] = useState(false)
  const [reactivateError,    setReactivateError   ] = useState<string | null>(null)

  const { sub, counters, limits } = state

  // Compute warning / exceeded sets (monthly + daily)
  const TRACKED_LIMIT_METRICS = [...MONTHLY_BAR_METRICS, ...DAILY_BAR_METRICS]
  const warnedMetrics   = TRACKED_LIMIT_METRICS.filter(m => {
    const s = getLimitStatus(m, counters, limits)
    return s.nearLimit && !s.exceeded && s.limit !== null
  })
  const exceededMetrics = TRACKED_LIMIT_METRICS.filter(m => {
    const s = getLimitStatus(m, counters, limits)
    return s.exceeded && s.limit !== null
  })

  const tierId = sub?.planId ?? "free"
  const tier   = getTier(tierId)
  const price  = formatPrice(tier.pricing.monthly.amountCents)

  const handleManageBilling = async () => {
    setPortalError(null)
    setPortalLoading(true)
    try {
      await openBillingPortal(window.location.href)
    } catch (e) {
      setPortalError(e instanceof CheckoutError ? e.message : "Could not open billing portal")
      setPortalLoading(false)
    }
  }

  const handleReactivate = async () => {
    setReactivateError(null)
    setReactivateLoading(true)
    try {
      await reactivateSubscription()
      // Reload to reflect the updated state from the server
      reload()
    } catch (e) {
      setReactivateError(e instanceof SubscriptionError ? e.message : "Could not reactivate. Please try again.")
      setReactivateLoading(false)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-card animate-pulse", className)}>
        <div className="p-5 space-y-3">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded" />
          <div className="h-2 w-full bg-muted rounded-full mt-4" />
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
        <p className="text-sm text-muted-foreground font-sans">{error}</p>
        <button
          onClick={reload}
          className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline font-sans"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className={cn("rounded-xl border border-border bg-card divide-y divide-border/60", className)}>

      {/* ── Plan header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          {/* Plan name + icon */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-muted-foreground">{TIER_ICONS[tierId]}</span>
            <span className="font-medium text-foreground font-sans text-sm">
              {tier.name} Plan
            </span>
            {sub?.status && <StatusPill status={sub.status} />}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-2xl font-serif text-foreground">{price}</span>
            {tier.pricing.monthly.amountCents > 0 && (
              <span className="text-sm text-muted-foreground font-sans">/mo</span>
            )}
          </div>

          {/* Trial end / billing date */}
          {sub?.status === "trialing" && sub.trialEnd ? (
            <DaysRemaining
              periodEnd={sub.trialEnd}
              cancelAtPeriodEnd={false}
              isTrialing
            />
          ) : sub?.currentPeriodEnd ? (
            <DaysRemaining
              periodEnd={sub.currentPeriodEnd}
              cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
            />
          ) : null}
        </div>

        {/* Quick upgrade link — free tier only */}
        {tierId === "free" && (
          <Link
            to="/upgrade"
            className="shrink-0 flex items-center gap-1 text-xs font-medium font-sans text-primary hover:underline mt-0.5"
          >
            Upgrade <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* ── Trial countdown ──────────────────────────────────────────────── */}
      {sub?.status === "trialing" && sub.trialEnd && (
        <TrialCountdown trialEnd={sub.trialEnd} planName={tier.name} />
      )}

      {/* ── Payment error banner ─────────────────────────────────────────── */}
      {(sub?.status === "past_due" || sub?.status === "incomplete" || sub?.status === "incomplete_expired") && (
        <div className="px-5 py-3">
          <PaymentErrorBanner
            status={sub.status}
            pastDueSince={sub.pastDueSince}
            onUpdatePayment={handleManageBilling}
          />
        </div>
      )}

      {/* ── Warning banner ───────────────────────────────────────────────── */}
      {(warnedMetrics.length > 0 || exceededMetrics.length > 0) && (
        <div className="px-5 py-3">
          <WarningBanner warned={warnedMetrics} exceeded={exceededMetrics} />
        </div>
      )}

      {/* ── Usage bars (monthly metrics) — layout matches "Per-submission limits" below ─ */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium font-sans text-muted-foreground uppercase tracking-wide mb-3">
          Usage this period
          {state.period && (
            <span className="normal-case font-normal ml-1.5 tracking-normal">
              ({formatDate(state.period.start)} – {formatDate(state.period.end)})
            </span>
          )}
        </p>

        <div className="space-y-2">
          {MONTHLY_BAR_METRICS.map(metric => (
            <UsageBar key={metric} metric={metric} counters={counters} limits={limits} />
          ))}

          {DAILY_BAR_METRICS.filter(m => limits[m] !== null).map(metric => (
            <UsageBar
              key={metric}
              metric={metric}
              counters={counters}
              limits={limits}
            />
          ))}

          {!compact && (
            <>
              {[
                { metric: "chars_processed" as UsageMetric, label: "Chars processed" },
                { metric: "pages_processed" as UsageMetric, label: "Pages processed" },
                { metric: "voice_requests"  as UsageMetric, label: "Voice requests" },
              ]
                .filter(({ metric }) => counters[metric] > 0)
                .map(({ metric, label }) => (
                  <div key={metric} className="flex items-center justify-between text-xs font-sans text-muted-foreground">
                    <span>{label}</span>
                    <span className="tabular-nums text-foreground/70">
                      {counters[metric].toLocaleString()}
                    </span>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* ── Per-request limits (plan facts) ─────────────────────────────── */}
      {!compact && (
        <div className="px-5 py-4">
          <p className="text-xs font-medium font-sans text-muted-foreground uppercase tracking-wide mb-3">
            Per-submission limits
          </p>
          <div className="space-y-2">
            {PER_REQUEST_FACTS.map(({ metric, label }) => {
              const limit = limits[metric]
              return (
                <div key={metric} className="flex items-center justify-between text-sm font-sans">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground tabular-nums">
                    {limit === null ? "∞ Unlimited" : limit.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 flex flex-col gap-2.5">

        {/* Reactivation — when subscription is pending cancellation */}
        {sub?.cancelAtPeriodEnd && sub.hasStripeSubscription && (
          <>
            <Button
              variant="default"
              className="w-full font-sans"
              onClick={handleReactivate}
              disabled={reactivateLoading}
            >
              {reactivateLoading
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <RotateCcw className="h-4 w-4 mr-2" />}
              Reactivate subscription
            </Button>
            {reactivateError && (
              <p className="text-xs text-destructive font-sans">{reactivateError}</p>
            )}
          </>
        )}

        {/* Manage billing (portal) — only for paid users */}
        {sub?.hasStripeSubscription && (
          <>
            <Button
              variant="outline"
              className="w-full font-sans justify-between"
              onClick={handleManageBilling}
              disabled={portalLoading}
            >
              <span className="flex items-center gap-2">
                {portalLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CalendarCheck2 className="h-4 w-4" />}
                {portalLoading ? "Opening billing…" : "Manage subscription"}
              </span>
              <span className="text-xs text-muted-foreground">Stripe Portal</span>
            </Button>
            {portalError && (
              <p className="text-xs text-destructive font-sans">{portalError}</p>
            )}
          </>
        )}

        {/* Upgrade CTA — free tier only */}
        {tierId === "free" && (
          <Link to="/upgrade" className="w-full">
            <Button
              variant={exceededMetrics.length > 0 ? "default" : "secondary"}
              className="w-full font-sans"
            >
              {exceededMetrics.length > 0 ? "Upgrade to continue →" : "View plans"}
            </Button>
          </Link>
        )}

        {/* Reload link */}
        <button
          onClick={reload}
          className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-sans"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  )
}
