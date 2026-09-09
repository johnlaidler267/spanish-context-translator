"use client"

import { useState } from "react"
import { BookOpen, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { LibraryEpub } from "@/lib/storage/epub-library"

/**
 * A tap on a library book now pauses on this before actually opening it -- reuses Discover's
 * ContentPreviewModal shell/CSS (`.discover-modal*`) for visual consistency, but skips what
 * that modal shows that a personal upload still genuinely doesn't have (difficulty, word
 * count, tags): just the cover, the title, the author and description when the EPUB's OPF
 * had them (see parse-epub.ts), and how far in you are.
 *
 * `discover-modal--compact` on the dialog gives the cover a bottom margin -- see that class's
 * own comment in index.css -- which the shared shell doesn't need for Discover's own modal,
 * where a preview section always follows the head.
 */
interface LibraryPreviewModalProps {
  book: LibraryEpub | null
  open: boolean
  onClose: () => void
  onStartReading: (book: LibraryEpub) => void
  /** 1-100, or null when this book hasn't been paged through yet. */
  progressPercent: number | null
  /** True while onStartReading's fetch (getUserEpubText, in App.tsx) is in flight -- swaps the
   *  CTA for a spinner so a slow connection doesn't read as the tap having done nothing. */
  isOpening: boolean
}

export function LibraryPreviewModal({
  book,
  open,
  onClose,
  onStartReading,
  progressPercent,
  isOpening,
}: LibraryPreviewModalProps) {
  const [coverBroken, setCoverBroken] = useState(false)

  if (!book) return null
  const showCoverImage = Boolean(book.coverImage) && !coverBroken

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent className="discover-modal discover-modal--compact">
        <button type="button" onClick={onClose} className="discover-modal__close" aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>

        <div className="discover-modal__scroll">
          <div className="discover-modal__head">
            <div className="discover-modal__cover">
              {showCoverImage ? (
                <img
                  src={book.coverImage!}
                  alt=""
                  className="discover-cover__img"
                  onError={() => setCoverBroken(true)}
                />
              ) : (
                <div className="discover-cover discover-cover--plate flex h-full w-full items-center justify-center">
                  <BookOpen className="discover-cover__motif" aria-hidden />
                </div>
              )}
            </div>

            <DialogHeader className="discover-modal__intro">
              <DialogTitle className="discover-modal__title mt-0">{book.title}</DialogTitle>
              {book.author && <p className="discover-modal__author">by {book.author}</p>}
              <p className="discover-modal__meta">
                <span>
                  {progressPercent != null
                    ? `${progressPercent}% read`
                    : `${book.charCount.toLocaleString()} characters`}
                </span>
              </p>
            </DialogHeader>
          </div>

          {book.description && (
            <div className="discover-modal__preview">
              <div className="discover-heading">
                <h4 className="discover-heading__label">Description</h4>
                <span className="discover-heading__rule" aria-hidden />
              </div>
              <div className="discover-modal__excerpt">
                <p>{book.description}</p>
              </div>
            </div>
          )}
        </div>

        <div className="discover-modal__actions">
          <Button
            className="discover-modal__cta"
            size="lg"
            onClick={() => onStartReading(book)}
            disabled={isOpening}
          >
            {isOpening ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : progressPercent != null ? (
              "Continue reading"
            ) : (
              "Start reading"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
