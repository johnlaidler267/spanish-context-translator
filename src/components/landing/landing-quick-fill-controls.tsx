"use client"

import { Dices, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"

interface LandingQuickFillControlsProps {
  onRandom: () => void
  onLearn: () => void
  randomPending: boolean
  learnPending: boolean
  /** e.g. submit in flight */
  disabled: boolean
  className?: string
}

/**
 * Random + Learn quick-fill controls. Docked in the textarea's own bottom-left
 * corner, mirroring the icon-only mic/translate controls already docked
 * bottom-right -- no button chrome of their own, icon-only on mobile, icon +
 * label (separated by a thin divider) on desktop. Was a standalone row of
 * pill buttons below the textarea; folded into the textfield itself so the
 * landing page reads as one composer instead of a composer plus a button bar.
 */
export function LandingQuickFillControls({
  onRandom,
  onLearn,
  randomPending,
  learnPending,
  disabled,
  className,
}: LandingQuickFillControlsProps) {
  const busy = disabled || randomPending || learnPending

  return (
    <div
      role="group"
      aria-label="Quick fill"
      className={cn("quick-fill-group", className)}
    >
      <button
        type="button"
        onClick={onRandom}
        disabled={busy}
        aria-busy={randomPending}
        aria-label="Random"
        className="quick-fill-btn"
      >
        {randomPending ? (
          <span className="content-pill-spinner" aria-hidden />
        ) : (
          <Dices className="quick-fill-icon" strokeWidth={1.75} aria-hidden />
        )}
        <span className="quick-fill-label">Random</span>
      </button>

      <span className="quick-fill-divider" aria-hidden />

      <button
        type="button"
        onClick={onLearn}
        disabled={busy}
        aria-busy={learnPending}
        aria-label="Learn"
        className="quick-fill-btn"
      >
        {learnPending ? (
          <span className="content-pill-spinner" aria-hidden />
        ) : (
          <GraduationCap className="quick-fill-icon" strokeWidth={1.75} aria-hidden />
        )}
        <span className="quick-fill-label">Learn</span>
      </button>
    </div>
  )
}
