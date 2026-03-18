"use client"

import { Link } from "react-router-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SubscriptionLapsedModalProps {
  onDismiss: () => void
}

export function SubscriptionLapsedModal({ onDismiss }: SubscriptionLapsedModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        aria-hidden
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm"
        role="alertdialog"
        aria-labelledby="lapsed-title"
        aria-describedby="lapsed-desc"
      >
        <h2
          id="lapsed-title"
          className="font-serif text-2xl font-medium text-foreground"
        >
          Subscription ended
        </h2>
        <p id="lapsed-desc" className="mt-3 text-muted-foreground">
          Your subscription has lapsed due to a failed payment or trial end.
          Resubscribe to continue reading Spanish with Lector.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link to="/settings" onClick={onDismiss}>
            <Button className="w-full">View pricing plans</Button>
          </Link>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>

        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
