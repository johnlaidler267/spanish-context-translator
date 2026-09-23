"use client"

import { AuthSignInOptions } from "@/components/auth/auth-sign-in-options"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getTier } from "@/lib/subscription/tiers"

/**
 * Books (Discover books and Library uploads) need a real account — the anonymous guest session
 * only exists to meter short pastes. A Radix Dialog, so it also stacks correctly on top of an
 * already-open Radix dialog (e.g. ContentPreviewModal). Sign-in redirects back to the current
 * page, so the reader lands where they were, ready to try again.
 */
export function BookSignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-medium">Sign in to read books</DialogTitle>
          <DialogDescription>
            Create a free account to start reading. It saves your place in every book, and the
            free plan includes the first {getTier("free").limits.freeReadingPagesPerBook} pages
            of any title. No password required.
          </DialogDescription>
        </DialogHeader>
        <AuthSignInOptions
          extraActions={
            <Button variant="ghost" className="mt-2 w-full" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
