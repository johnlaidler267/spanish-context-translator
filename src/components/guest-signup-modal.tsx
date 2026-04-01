"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthSignInOptions } from "@/components/auth-sign-in-options"
import { clearGuestUses } from "@/lib/guest-usage"

export interface GuestSignupModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Soft gate after anonymous previews are used — dismissible; opens again on the next submit attempt.
 */
export function GuestSignupModal({ open, onClose }: GuestSignupModalProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" aria-hidden onClick={onClose} />

      <div
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-signup-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6">
          <h2 id="guest-signup-title" className="font-serif text-2xl font-medium text-foreground mb-2">
            You&apos;ve used your free previews.
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <em>Create a free account to keep reading. No password required.</em>
          </p>
        </div>

        <AuthSignInOptions
          extraActions={
            import.meta.env.DEV ? (
              <Button
                type="button"
                variant="outline"
                className="w-full mt-3 border-amber-500/50 text-amber-700 dark:text-amber-400"
                onClick={() => {
                  clearGuestUses()
                  onClose()
                }}
              >
                Continue without signing in (dev only)
              </Button>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}
