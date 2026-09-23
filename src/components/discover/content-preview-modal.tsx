"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Trash2, X } from "lucide-react"
import { DiscoverCoverArt } from "@/components/discover/discover-cover-art"
import { DifficultyMark, normalizeDifficulty } from "@/components/discover/difficulty-mark"
import { BookSignInDialog } from "@/components/auth/book-sign-in-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { contentTypeLabels } from "@/lib/discover/content-data"
import type { ContentItem } from "@/lib/discover/content-data"

/**
 * What "Start reading" can come back with instead of opening the reader: a plan-limit message,
 * or a guest trying to open a book (books need an account — see handleDiscoverStartReading).
 */
export type StartReadingResult = { blockedMessage: string } | { signInRequired: true } | void

interface ContentPreviewModalProps {
  content: ContentItem | null
  open: boolean
  onClose: () => void
  onStartReading: (content: ContentItem) => Promise<StartReadingResult> | StartReadingResult
  /** True when this reader already has a saved page position for `content` — swaps the CTA to "Continue reading". */
  hasProgress?: boolean
  /** When set (e.g. Vite dev), shows a catalog edit entry point. */
  onDevEdit?: () => void
  /** When set (curator / dev), removes this row from `discover_items` then closes. */
  onDeleteCatalog?: () => void | Promise<void>
}

export function ContentPreviewModal({
  content,
  open,
  onClose,
  onStartReading,
  hasProgress = false,
  onDevEdit,
  onDeleteCatalog,
}: ContentPreviewModalProps) {
  const [startReadingError, setStartReadingError] = useState<string | null>(null)
  const [signInPromptOpen, setSignInPromptOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setStartReadingError(null)
      setSignInPromptOpen(false)
    }
  }, [open, content?.id])

  if (!content) return null

  const difficulty = normalizeDifficulty(content.difficulty)

  const handleStartReading = async () => {
    setStartReadingError(null)
    const result = await onStartReading(content)
    if (!result) return
    if ("signInRequired" in result) setSignInPromptOpen(true)
    else setStartReadingError(result.blockedMessage)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose()
        }}
      >
        <DialogContent className="discover-modal">
          <button type="button" onClick={onClose} className="discover-modal__close" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>

          <div className="discover-modal__scroll">
            <div className="discover-modal__head">
              <div className="discover-modal__cover">
                <DiscoverCoverArt content={content} eager />
              </div>

              <DialogHeader className="discover-modal__intro">
                <p className="discover-modal__kicker">
                  {contentTypeLabels[content.type]} · {content.language}
                </p>
                <DialogTitle className="discover-modal__title">{content.title}</DialogTitle>
                <p className="discover-modal__author">by {content.author}</p>
                <div className="discover-modal__meta">
                  <DifficultyMark level={difficulty} />
                  <span>{content.estimatedTime}</span>
                  <span>{content.wordCount.toLocaleString()} words</span>
                </div>
                {content.tags.length > 0 && (
                  <div className="discover-modal__tags">
                    {content.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </DialogHeader>
            </div>

            <div className="discover-modal__preview">
              <div className="discover-heading">
                <h4 className="discover-heading__label">Preview</h4>
                <span className="discover-heading__rule" aria-hidden />
              </div>
              <div className="discover-modal__excerpt">
                {content.preview.trim() ? (
                  <p>{content.preview}</p>
                ) : (
                  <p className="discover-modal__excerpt-empty">No preview available.</p>
                )}
              </div>
            </div>
          </div>

          <div className="discover-modal__actions">
            <Button className="discover-modal__cta" size="lg" onClick={() => void handleStartReading()}>
              {hasProgress ? "Continue reading" : "Start reading"}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            {onDevEdit && (
              <Button variant="outline" size="lg" className="discover-trigger" onClick={onDevEdit}>
                Edit entry
              </Button>
            )}
            {onDeleteCatalog && (
              <Button
                variant="outline"
                size="lg"
                className="discover-trigger discover-modal__danger"
                onClick={() => void onDeleteCatalog()}
                aria-label="Remove from catalog"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested for the same reason as the plan-limit popup below. */}
      <BookSignInDialog open={signInPromptOpen} onOpenChange={setSignInPromptOpen} />

      {/* A separate, nested Dialog rather than the app-wide RateLimitModal (see
          handleDiscoverStartReading in App.tsx): that modal is a plain document.body portal,
          and Radix's own Dialog leaves everything outside its *own* content non-interactive
          while open, which made a stacked RateLimitModal render on top but never receive
          clicks. A second Radix Dialog is a layer Radix itself knows how to stack, so it works
          -- and, being a popup rather than inline text in the scrollable body above, it no
          longer pushes "Start reading" down/off-screen the way the old inline notice did. */}
      <Dialog
        open={!!startReadingError}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setStartReadingError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plan limit reached</DialogTitle>
            <DialogDescription>{startReadingError}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <Link
              to="/upgrade"
              onClick={onClose}
              className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
            >
              View upgrade options
            </Link>
            <span className="mx-1.5 text-border" aria-hidden>
              ·
            </span>
            <Link
              to="/settings?tab=billing"
              onClick={onClose}
              className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
            >
              Billing & usage
            </Link>
          </p>
          <DialogFooter>
            <Button onClick={() => setStartReadingError(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
