"use client"

/**
 * PaymentErrorBanner
 *
 * Shown when a subscription is in a `past_due` or `incomplete` state.
 * Displays how much time the user has left before service is restricted,
 * and provides a direct link to update their payment method.
 *
 * This matches the server-side PAST_DUE_GRACE_DAYS constant (default 3).
 * Adjust GRACE_DAYS here if you change the server-side default.
 */

import { AlertCircle, CreditCard, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Keep in sync with supabase/functions/_shared/grace-period.ts
const GRACE_DAYS = 3

function gracePeriodMsRemaining(pastDueSince: string): number {
  const since    = new Date(pastDueSince).getTime()
  const deadline = since + GRACE_DAYS * 24 * 60 * 60 * 1000
  return Math.max(0, deadline - Date.now())
}

function graceDaysLabel(ms: number): string {
  const hours = ms / (1000 * 60 * 60)
  if (hours < 1)   return "less than an hour"
  if (hours < 24)  return `${Math.ceil(hours)} hours`
  const days = Math.ceil(hours / 24)
  return `${days} day${days !== 1 ? "s" : ""}`
}

interface PaymentErrorBannerProps {
  status:        string
  pastDueSince?: string | null
  onUpdatePayment: () => void
  /** Extra classes on the outer wrapper. */
  className?: string
}

export function PaymentErrorBanner({
  status,
  pastDueSince,
  onUpdatePayment,
  className,
}: PaymentErrorBannerProps) {
  const isPastDue  = status === "past_due"
  const isIncomplete = status === "incomplete" || status === "incomplete_expired"

  if (!isPastDue && !isIncomplete) return null

  const msLeft = pastDueSince ? gracePeriodMsRemaining(pastDueSince) : null
  const gracePeriodActive = msLeft !== null && msLeft > 0
  const gracePeriodExpired = msLeft !== null && msLeft <= 0
  const unknownGrace = msLeft === null  // no timestamp yet

  const isUrgent = gracePeriodExpired || isIncomplete

  const title = isUrgent
    ? "Your access has been restricted"
    : "Payment overdue"

  const message = gracePeriodExpired
    ? "Your account has been downgraded to the free plan. Upgrade to restore full access."
    : isIncomplete
    ? "Your subscription setup wasn't completed. Please update your payment method to activate your plan."
    : unknownGrace
    ? "Your last payment failed. Please update your payment method to avoid service interruption."
    : `Your last payment failed. Update your payment method within ${graceDaysLabel(msLeft!)} to keep your current plan.`

  const Icon = isUrgent ? XCircle : AlertCircle

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm font-sans",
        isUrgent
          ? "bg-destructive/8 border-destructive/30 text-destructive"
          : "bg-amber-500/8 border-amber-500/30 text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5 opacity-80" />
      <div className="flex-1 min-w-0 space-y-2">
        <p className={cn(
          "font-medium leading-snug",
          isUrgent ? "text-destructive" : "text-amber-800 dark:text-amber-200",
        )}>
          {title}
        </p>
        <p className={cn(
          "text-xs leading-relaxed",
          isUrgent ? "text-destructive/80" : "text-amber-700/90 dark:text-amber-300/80",
        )}>
          {message}
        </p>
        <Button
          size="sm"
          variant={isUrgent ? "destructive" : "outline"}
          className={cn(
            "h-7 text-xs gap-1.5",
            !isUrgent && "border-amber-500/50 text-amber-800 hover:bg-amber-500/10 dark:text-amber-200",
          )}
          onClick={onUpdatePayment}
        >
          <CreditCard className="h-3.5 w-3.5" />
          {gracePeriodExpired ? "Restore access" : "Update payment method"}
        </Button>
      </div>
    </div>
  )
}
