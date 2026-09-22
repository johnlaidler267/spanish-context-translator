"use client"

import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

interface AuthCtaProps {
  /** Take the leftover width — for a sidebar footer, not a header row. */
  stretch?: boolean
  className?: string
}

/**
 * The signed-out call to action. Deliberately one button, not a sign-in/sign-up pair:
 * auth here is passwordless, so the same magic link both signs an existing user in and
 * creates an account for a new one. Two buttons would advertise a choice that the flow
 * behind them doesn't actually offer — the modal says so in as many words instead.
 */
export function AuthCta({ stretch = false, className }: AuthCtaProps) {
  const { openAuthModal } = useAuth()

  return (
    <button
      type="button"
      onClick={() => openAuthModal()}
      className={cn(
        "rounded-full bg-primary px-3.5 py-1.5 font-sans text-sm font-medium text-primary-foreground",
        // Tinted from --primary (#2c5a8c), not the warm rail shadow used elsewhere —
        // a terracotta shadow under a navy fill reads as a smudge. Literal rgba because
        // --primary is a plain hex, not the rgb-triplet form Tailwind needs for /opacity.
        "shadow-[0_1px_5px_rgba(44,90,140,0.22)]",
        "transition-colors duration-200 ease-in-out hover:bg-primary/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "max-md:px-3 max-md:py-2",
        stretch && "w-full",
        className,
      )}
    >
      Sign in
    </button>
  )
}
