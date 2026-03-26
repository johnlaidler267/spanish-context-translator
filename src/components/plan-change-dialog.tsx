/**
 * PlanChangeDialog
 *
 * Confirmation dialog shown before a user cancels their subscription or
 * downgrades to a lower tier. It explicitly lists the features and limits
 * they will lose so there are no surprises.
 *
 * Usage:
 *   <PlanChangeDialog
 *     open={!!pendingAction}
 *     action="cancel"                    // or "downgrade"
 *     currentTier={getTier(currentId)}
 *     targetTier={getTier(targetId)}
 *     periodEnd="2026-04-18T00:00:00Z"   // current billing period end
 *     loading={isSubmitting}
 *     onConfirm={handleConfirm}
 *     onCancel={() => setPendingAction(null)}
 *   />
 */

import { AlertTriangle, ArrowRight, TrendingDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TierConfig } from "@/lib/tiers"
import { diffTiers } from "@/lib/subscription"

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlanChangeDialogProps {
  open: boolean
  /** "cancel" = end subscription at period end; "downgrade" = switch to lower paid tier */
  action: "cancel" | "downgrade"
  currentTier: TierConfig
  targetTier: TierConfig
  /**
   * ISO timestamp — for "cancel": the date access ends;
   * for "downgrade": shown as effective-from date.
   */
  periodEnd: string | null
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "the end of your billing period"
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day:   "numeric",
    year:  "numeric",
  })
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function PlanChangeDialog({
  open,
  action,
  currentTier,
  targetTier,
  periodEnd,
  loading,
  onConfirm,
  onCancel,
}: PlanChangeDialogProps) {
  if (!open) return null

  const diff       = diffTiers(currentTier.id, targetTier.id)
  const hasLosses  = diff.lostFeatures.length > 0 || diff.tighterLimits.length > 0
  const dateLabel  = formatDate(periodEnd)

  const isCancel   = action === "cancel"
  const isDowngrade = action === "downgrade"

  const title = isCancel
    ? `Cancel ${currentTier.name} subscription?`
    : `Downgrade to ${targetTier.name}?`

  const confirmLabel = isCancel ? "Cancel subscription" : `Downgrade to ${targetTier.name}`

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-change-title"
    >
      {/* Dim overlay */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={loading ? undefined : onCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              isCancel ? "bg-destructive/10" : "bg-amber-500/10",
            )}>
              {isCancel
                ? <AlertTriangle className="h-5 w-5 text-destructive" />
                : <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              }
            </div>
            <h2
              id="plan-change-title"
              className="text-base font-semibold text-foreground leading-snug font-sans"
            >
              {title}
            </h2>
          </div>
          {!loading && (
            <button
              onClick={onCancel}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-4 font-sans text-sm">

          {/* Summary sentence */}
          {isCancel && (
            <p className="text-muted-foreground">
              You&apos;ll keep full <span className="font-medium text-foreground">{currentTier.name}</span> access
              until <span className="font-medium text-foreground">{dateLabel}</span>.
              After that your account reverts to the{" "}
              <span className="font-medium text-foreground">Free</span> plan.
            </p>
          )}
          {isDowngrade && (
            <p className="text-muted-foreground">
              Your plan switches from{" "}
              <span className="font-medium text-foreground">{currentTier.name}</span>
              {" "}<ArrowRight className="inline h-3.5 w-3.5 mx-0.5" />{" "}
              <span className="font-medium text-foreground">{targetTier.name}</span>{" "}
              immediately. You&apos;ll receive a{" "}
              <span className="font-medium text-foreground">prorated credit</span>{" "}
              for unused {currentTier.name} time.
            </p>
          )}

          {/* What you'll lose */}
          {hasLosses && (
            <div className={cn(
              "rounded-lg border p-4 space-y-3",
              isCancel
                ? "border-destructive/20 bg-destructive/5"
                : "border-amber-500/20 bg-amber-500/5",
            )}>
              <p className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                isCancel
                  ? "text-destructive"
                  : "text-amber-600 dark:text-amber-400",
              )}>
                {isCancel ? "What you'll lose" : "Limits that change"}
              </p>

              {diff.lostFeatures.length > 0 && (
                <ul className="space-y-1.5">
                  {diff.lostFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-foreground">
                      <X className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isCancel ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                      )} />
                      {f}
                    </li>
                  ))}
                </ul>
              )}

              {diff.tighterLimits.length > 0 && (
                <ul className="space-y-1.5">
                  {diff.tighterLimits.map((l) => (
                    <li key={l.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                      <span className="text-foreground font-medium capitalize">{l.label}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={cn(
                        isCancel ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                        "font-medium",
                      )}>
                        {l.to}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Reactivation note for cancellations */}
          {isCancel && (
            <p className="text-xs text-muted-foreground">
              Changed your mind? You can reactivate your subscription any time before {dateLabel}.
            </p>
          )}

          {/* Proration note for downgrades */}
          {isDowngrade && (
            <p className="text-xs text-muted-foreground">
              Prorations appear on your next invoice. No immediate charge unless
              the new plan costs more (which is not the case here).
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className={cn(
                "flex-1 rounded-lg border border-border bg-background px-4 py-2.5",
                "text-sm font-medium text-foreground transition-colors",
                "hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              Keep {currentTier.name}
            </button>

            <button
              onClick={onConfirm}
              disabled={loading}
              className={cn(
                "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isCancel
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600",
              )}
            >
              {loading ? "Processing…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
