"use client"

import { BookMarked, Clock, Globe, Trash2, X } from "lucide-react"
import { ContentTypeBadge } from "@/components/discover/content-type-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { ContentItem, DifficultyLevel } from "@/lib/content-data"
import { difficultyColors } from "@/lib/content-data"
import { cn } from "@/lib/utils"

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

interface ContentPreviewModalProps {
  content: ContentItem | null
  open: boolean
  onClose: () => void
  onStartReading: (content: ContentItem) => void
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
  if (!content) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden border-border/50 bg-card p-0 font-sans sm:w-full">
        <div className="relative h-36 shrink-0 overflow-hidden sm:h-48">
          <img
            src={content.coverImage}
            alt={content.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-background/80 p-2 backdrop-blur-sm transition-colors hover:bg-background"
          >
            <X className="size-4" />
          </button>

          <div className="absolute bottom-4 left-6 right-6">
            <div className="mb-2 flex items-center gap-2">
              <ContentTypeBadge type={content.type} size="md" className="rounded-md" />
              <Badge
                variant="outline"
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm",
                  difficultyColors[content.difficulty],
                )}
              >
                {difficultyLabels[content.difficulty]}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-6 pt-0 [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]">
          <DialogHeader className="mb-4">
            <DialogTitle className="font-serif text-2xl font-bold text-foreground">{content.title}</DialogTitle>
            <p className="font-reading text-sm text-muted-foreground">by {content.author}</p>
          </DialogHeader>

          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="size-4" />
              <span>{content.language}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="size-4" />
              <span>{content.estimatedTime}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookMarked className="size-4" />
              <span>{content.wordCount.toLocaleString()} words</span>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {content.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border/70 bg-muted px-3 py-1 text-sm font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="mb-4">
            <h4 className="mb-3 font-reading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </h4>
            <ScrollArea className="h-36 max-h-[40vh] rounded-lg border border-border/50 bg-background/50 p-4 sm:h-48 sm:max-h-none">
              <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                {content.preview}
              </p>
            </ScrollArea>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className="min-w-0 flex-1" size="lg" onClick={() => onStartReading(content)}>
              Start Reading
            </Button>
            <Button variant="outline" size="lg" className="min-w-0 flex-1">
              Add to Library
            </Button>
            {onDevEdit && (
              <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={onDevEdit}>
                Edit catalog entry
              </Button>
            )}
            {onDeleteCatalog && (
              <Button
                variant="outline"
                size="lg"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 sm:w-auto"
                onClick={() => void onDeleteCatalog()}
              >
                <Trash2 className="mr-2 size-4 shrink-0" aria-hidden />
                Remove from catalog
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
