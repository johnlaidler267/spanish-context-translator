"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface WhereYouLeftOffModalProps {
  /** Title of the book/piece being resumed — shown in the heading when present. */
  bookTitle?: string | null
  /**
   * Cached one-sentence English recap of the page right *before* the resumed page — generated
   * once by Gemini Flash Lite when the reader left the book last time (see
   * `maybeSummarizePreviousPageOnLeave` in src/lib/translate/page-recap.ts) and read here from
   * the local cache (reading-recap-storage.ts) with no network call. Primary content when
   * present; null/undefined when there's no cached recap yet (summarization failed, there was
   * no previous page to summarize, or this progress predates this feature) — the modal falls
   * back to `excerpt` in that case.
   */
  summary?: string | null
  /**
   * Verbatim excerpt (first ~16 words) of the page the reader is being resumed to — see
   * `resumeExcerptFromPageSource` (src/lib/translate/page-split.ts). Computed for free
   * client-side; shown only as a fallback when `summary` isn't available.
   */
  excerpt: string
  onDismiss: () => void
}

/**
 * Shown once, right after a book/article the reader has already made progress on is reopened,
 * so it's obvious at a glance this is the same spot they left off — without re-reading from the
 * top to get oriented. Purely informational: the reader is already on the resumed page
 * underneath this, so the only action is dismissing it.
 */
export function WhereYouLeftOffModal({
  bookTitle,
  summary,
  excerpt,
  onDismiss,
}: WhereYouLeftOffModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || typeof document === "undefined") return null

  const hasSummary = Boolean(summary?.trim())

  return createPortal(
    <div
      data-where-left-off-modal
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ isolation: "isolate" }}
    >
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        aria-hidden
        onClick={onDismiss}
      />

      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="where-left-off-title"
        aria-describedby="where-left-off-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="where-left-off-title"
          className="font-serif text-2xl font-medium text-foreground pr-8"
        >
          Welcome back{bookTitle ? ` to ${bookTitle}` : ""}
        </h2>
        <p id="where-left-off-desc" className="mt-3 text-sm text-muted-foreground">
          {hasSummary ? "Previously:" : "You left off around:"}
        </p>
        <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-reading text-base italic leading-relaxed text-foreground">
          “{hasSummary ? summary : excerpt}”
        </p>

        <div className="mt-6">
          <Button type="button" className="w-full" onClick={onDismiss}>
            Continue reading
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
