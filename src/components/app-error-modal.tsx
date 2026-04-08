"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface AppErrorModalProps {
  message: string
  onDismiss: () => void
  title?: string
  /** When set, shows a primary retry action before the dismiss button. */
  onRetry?: () => void
  retryLabel?: string
  dismissLabel?: string
  /** If false, backdrop click does not dismiss (still can use buttons / X). */
  closeOnBackdrop?: boolean
}

export function AppErrorModal({
  message,
  onDismiss,
  title = "Something went wrong",
  onRetry,
  retryLabel = "Retry",
  dismissLabel = "OK",
  closeOnBackdrop = true,
}: AppErrorModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      data-app-error-modal
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ isolation: "isolate" }}
    >
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        aria-hidden
        onClick={closeOnBackdrop ? onDismiss : undefined}
      />

      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-error-title"
        aria-describedby="app-error-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="app-error-title"
          className="font-serif text-2xl font-medium text-foreground pr-8"
        >
          {title}
        </h2>
        <p
          id="app-error-desc"
          className="mt-3 text-sm text-destructive whitespace-pre-wrap break-words"
        >
          {message}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {onRetry && (
            <Button type="button" className="w-full" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={onRetry ? "outline" : "default"}
            className="w-full"
            onClick={onDismiss}
          >
            {dismissLabel}
          </Button>
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
