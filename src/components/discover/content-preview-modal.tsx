"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Trash2, X } from "lucide-react"
import { DiscoverCoverArt } from "@/components/discover/discover-cover-art"
import { DifficultyMark, normalizeDifficulty } from "@/components/discover/difficulty-mark"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { contentTypeLabels } from "@/lib/discover/content-data"
import type { ContentItem } from "@/lib/discover/content-data"

interface ContentPreviewModalProps {
  content: ContentItem | null
  open: boolean
  onClose: () => void
  onStartReading: (
    content: ContentItem,
  ) => Promise<{ blockedMessage?: string } | void> | { blockedMessage?: string } | void
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
  onDevEdit,
  onDeleteCatalog,
}: ContentPreviewModalProps) {
  const [startReadingError, setStartReadingError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setStartReadingError(null)
  }, [open, content?.id])

  if (!content) return null

  const difficulty = normalizeDifficulty(content.difficulty)

  const handleStartReading = async () => {
    setStartReadingError(null)
    const result = await onStartReading(content)
    if (result?.blockedMessage) {
      setStartReadingError(result.blockedMessage)
    }
  }

  return (
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
                <p className="discover-modal__excerpt-pending">Loading preview…</p>
              )}
            </div>
          </div>

          {startReadingError && (
            <p className="discover-modal__notice" role="alert">
              {startReadingError}
            </p>
          )}
        </div>

        <div className="discover-modal__actions">
          <Button className="discover-modal__cta" size="lg" onClick={() => void handleStartReading()}>
            Start reading
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
  )
}
