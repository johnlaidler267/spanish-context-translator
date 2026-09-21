"use client"

import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

interface AuthCtaProps {
  /**
   * "pair" shows a quiet Sign in next to a filled Sign up — the default for
   * anywhere with room for both. "compact" drops Sign in and keeps only the
   * filled Sign up, for rails too narrow to hold two labels.
   */
  layout?: "pair" | "compact"
  /** Let Sign up take the leftover width — for a sidebar footer, not a header row. */
  stretch?: boolean
  className?: string
}

/**
 * The signed-out call to action. Both buttons open the same modal (auth here is
 * passwordless, so signing in and signing up are one operation) and differ only in
 * the intent they pass, which sets the modal's framing.
 */
export function AuthCta({ layout = "pair", stretch = false, className }: AuthCtaProps) {
  const { openAuthModal } = useAuth()

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {layout === "pair" && (
        <button
          type="button"
          onClick={() => openAuthModal("signin")}
          className={cn(
            "rounded-full px-3 py-1.5 font-sans text-sm font-medium text-foreground/75",
            "transition-colors duration-200 ease-in-out hover:bg-muted/45 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            "max-md:px-2.5 max-md:py-2",
          )}
        >
          Sign in
        </button>
      )}
      <button
        type="button"
        onClick={() => openAuthModal("signup")}
        className={cn(
          "rounded-full bg-primary px-3.5 py-1.5 font-sans text-sm font-medium text-primary-foreground",
          // Tinted from --primary (#2c5a8c), not the warm rail shadow used elsewhere —
          // a terracotta shadow under a navy fill reads as a smudge. Literal rgba because
          // --primary is a plain hex, not the rgb-triplet form Tailwind needs for /opacity.
          "shadow-[0_1px_5px_rgba(44,90,140,0.22)]",
          "transition-colors duration-200 ease-in-out hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          "max-md:px-3 max-md:py-2",
          stretch && "flex-1",
        )}
      >
        Sign up
      </button>
    </div>
  )
}
