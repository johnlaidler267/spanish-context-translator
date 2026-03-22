"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RateLimitModalProps {
  message: string
  onDismiss: () => void
}

export function RateLimitModal({ message, onDismiss }: RateLimitModalProps) {
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
          Rate limit reached
        </h2>
        <p
          id="rate-limit-desc"
          className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap break-words"
        >
          {message}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Wait a bit and try again, or switch to a different model in your provider settings if this
          keeps happening.
        </p>

        <Button className="mt-6 w-full" onClick={onDismiss}>
          OK
        </Button>

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
