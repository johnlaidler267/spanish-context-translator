"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RateLimitModalProps {
  message: string
  onDismiss: () => void
  /**
   * Dev-only: extra action to dismiss, clear throttled state, and keep working locally.
   * When omitted, only the normal dismiss controls are shown.
   */
  devBypass?: () => void
  /** Defaults to "Rate limit reached". Use "Plan limit reached" for subscription caps. */
  title?: string
  /** When false, hides the LLM provider / retry hint (plan limits). Default true. */
  showProviderHint?: boolean
  /** Extra content below the message (e.g. upgrade links). */
  extraFooter?: ReactNode
}

export function RateLimitModal({
  message,
  onDismiss,
  devBypass,
  title = "Rate limit reached",
  showProviderHint = true,
  extraFooter,
}: RateLimitModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ isolation: "isolate" }}
    >
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        aria-hidden
        onClick={onDismiss}
      />

      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rate-limit-title"
        aria-describedby="rate-limit-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="rate-limit-title"
          className="font-serif text-2xl font-medium text-foreground pr-8"
        >
          {title}
        </h2>
        <p
          id="rate-limit-desc"
          className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap break-words"
        >
          {message}
        </p>
        {showProviderHint && (
          <p className="mt-4 text-sm text-muted-foreground">
            Wait a bit and try again, or switch to a different model in your provider settings if this
            keeps happening.
          </p>
        )}
        {extraFooter}

        <div className="mt-6 flex flex-col gap-2">
          <Button className="w-full" onClick={onDismiss}>
            OK
          </Button>
          {devBypass && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-amber-500/50 text-amber-700 dark:text-amber-400"
              onClick={devBypass}
            >
              Ignore limit & continue (dev only)
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors duration-200 ease-in-out hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
