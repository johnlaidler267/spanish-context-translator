"use client"

import { Dices, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"

interface LandingContentPillsProps {
  onRandom: () => void
  onLearn: () => void
  randomPending: boolean
  learnPending: boolean
  /** e.g. submit in flight */
  disabled: boolean
  className?: string
}

export function LandingContentPills({
  onRandom,
  onLearn,
  randomPending,
  learnPending,
  disabled,
  className,
}: LandingContentPillsProps) {
  const busy = disabled || randomPending || learnPending

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div
        role="group"
        aria-label="Quick fill"
        className="flex flex-wrap items-center justify-center gap-2"
      >
        <button
          type="button"
          onClick={onRandom}
          disabled={busy}
          aria-busy={randomPending}
          className={cn(
            "content-pill inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
            "border-black/[0.08] bg-white text-[#3a332e]",
            "hover:border-[#c97a5a]/35 hover:bg-[#faf8f5]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/35",
            "disabled:pointer-events-none disabled:opacity-45",
            "dark:border-white/[0.12] dark:bg-[#1a1917] dark:text-[#e8e4dc]",
            "dark:hover:border-[#c97a5a]/30 dark:hover:bg-[#22211e]",
          )}
        >
          {randomPending ? (
            <span className="content-pill-spinner" aria-hidden />
          ) : (
            <Dices className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
          )}
          Random
        </button>

        <button
          type="button"
          onClick={onLearn}
          disabled={busy}
          aria-busy={learnPending}
          className={cn(
            "content-pill inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
            "border-black/[0.08] bg-white text-[#3a332e]",
            "hover:border-[#c97a5a]/35 hover:bg-[#faf8f5]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/35",
            "disabled:pointer-events-none disabled:opacity-45",
            "dark:border-white/[0.12] dark:bg-[#1a1917] dark:text-[#e8e4dc]",
            "dark:hover:border-[#c97a5a]/30 dark:hover:bg-[#22211e]",
          )}
        >
          {learnPending ? (
            <span className="content-pill-spinner" aria-hidden />
          ) : (
            <GraduationCap className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
          )}
          Learn
        </button>
      </div>
    </div>
  )
}
