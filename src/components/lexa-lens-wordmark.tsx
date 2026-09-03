import { LexaLensMark } from "@/components/lexa-lens-mark"
import { cn } from "@/lib/utils"

export const LEXA_LENS_WORD_GRADIENT =
  "wordmark-gradient"

type LexaLensWordmarkProps = {
  className?: string
  /** When true, logo text is hidden (narrow sidebar rail). */
  compact?: boolean
}

export function LexaLensWordmark({ className, compact }: LexaLensWordmarkProps) {
  return (
    <span
      className={cn(
        "font-display text-[1.2rem] font-bold leading-none tracking-[-0.02em] antialiased max-md:text-[1.15rem] md:text-[1.35rem] [font-feature-settings:'kern'_1,'liga'_1] inline-flex items-center gap-px min-w-0",
        className,
      )}
    >
      <LexaLensMark className={cn("h-[0.94em] w-[0.94em]", !compact && "mr-[0.18em]")} />
      {!compact ? (
        <span className={cn(LEXA_LENS_WORD_GRADIENT, "inline-flex items-center gap-0.25 truncate")}>
          <span>Lexa</span>
          <span
            className="mx-0 mt-1 inline-block h-[3px] w-[4px] shrink-0 rounded-full bg-brand-ink-mid"
            aria-hidden
          />
          <span>Lens</span>
        </span>
      ) : null}
    </span>
  )
}
