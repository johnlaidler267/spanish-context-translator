"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { AuthSignInOptions } from "@/components/auth-sign-in-options"
import { useAuth } from "@/contexts/auth-context"

export function AuthModal() {
  const { authModalOpen, closeAuthModal } = useAuth()

  useEffect(() => {
    if (!authModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [authModalOpen])

  if (!authModalOpen) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" aria-hidden onClick={closeAuthModal} />

      <div
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-7 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button
          type="button"
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6">
          <h2 id="auth-modal-title" className="font-serif text-2xl font-medium text-foreground">
            Sign in to LexaLens
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Save your reading history and unlock your free plan.
          </p>
        </div>

        <AuthSignInOptions />
      </div>
    </div>
  )
}
