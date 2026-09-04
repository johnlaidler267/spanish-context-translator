"use client"

import { BookUp, Dices, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"

interface LandingContentPillsProps {
  onRandom: () => void
  onLearn: () => void
  onUpload: () => void
  randomPending: boolean
  learnPending: boolean
  uploadPending: boolean
  /** e.g. submit in flight */
  disabled: boolean
  className?: string
}

/**
 * One surface treatment, three pills. Was copied verbatim at each call site,
 * so a colour change meant three edits and a chance to miss one.
 */
const CONTENT_PILL_SURFACE = [
  "border-black/[0.08] bg-pill-surface text-pill-ink",
  "hover:border-reading-warm/35 hover:bg-pill-surface-hover",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
].join(" ")

const CONTENT_PILL_SURFACE_DARK = [
  "dark:border-white/[0.12]",
  "dark:hover:border-reading-warm/30",
].join(" ")

export function LandingContentPills({
  onRandom,
  onLearn,
  onUpload,
  randomPending,
  learnPending,
  uploadPending,
  disabled,
  className,
}: LandingContentPillsProps) {
  const busy = disabled || randomPending || learnPending || uploadPending

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
            CONTENT_PILL_SURFACE,
            "disabled:pointer-events-none disabled:opacity-45",
            CONTENT_PILL_SURFACE_DARK,
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
            CONTENT_PILL_SURFACE,
            "disabled:pointer-events-none disabled:opacity-45",
            CONTENT_PILL_SURFACE_DARK,
          )}
        >
          {learnPending ? (
            <span className="content-pill-spinner" aria-hidden />
          ) : (
            <GraduationCap className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
          )}
          Learn
        </button>

        <button
          type="button"
          onClick={onUpload}
          disabled={busy}
          aria-busy={uploadPending}
          className={cn(
            "content-pill inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
            CONTENT_PILL_SURFACE,
            "disabled:pointer-events-none disabled:opacity-45",
            CONTENT_PILL_SURFACE_DARK,
          )}
        >
          {uploadPending ? (
            <span className="content-pill-spinner" aria-hidden />
          ) : (
            <BookUp className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
          )}
          Upload EPUB
        </button>
      </div>
    </div>
  )
}
