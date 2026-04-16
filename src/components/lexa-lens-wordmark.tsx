import { RiTranslateAi } from "react-icons/ri"
import { cn } from "@/lib/utils"

export const LEXA_LENS_WORD_GRADIENT =
  "inline-block bg-gradient-to-br from-[#2f2926] via-[#4a3f38] to-[#c97a5a] bg-clip-text text-transparent dark:from-[#e8dfd4] dark:via-[#d4a896] dark:to-[#b06b56]"

type LexaLensWordmarkProps = {
  className?: string
  /** When true, logo text is hidden (narrow sidebar rail). */
  compact?: boolean
}

export function LexaLensWordmark({ className, compact }: LexaLensWordmarkProps) {
  return (
    <span
      className={cn(
        "font-fraunces text-[1.2rem] font-bold leading-none tracking-[-0.03em] antialiased max-md:text-[1.15rem] md:text-[1.35rem] [font-feature-settings:'kern'_1,'liga'_1] inline-flex items-center gap-px min-w-0",
        className,
      )}
    >
      <RiTranslateAi
        className="h-[1.1rem] w-[1.1rem] shrink-0 text-[#4a3f38] dark:text-[#d4a896]"
        aria-hidden
      />
      {!compact ? (
        <span className={cn(LEXA_LENS_WORD_GRADIENT, "inline-flex items-center gap-0.25 truncate")}>
          <span>Lexa</span>
          <span
            className="mx-0 mt-1 inline-block h-[3px] w-[4px] shrink-0 rounded-full bg-[#4a3f38] dark:bg-[#d4a896]"
            aria-hidden
          />
          <span>Lens</span>
        </span>
      ) : null}
    </span>
  )
}
