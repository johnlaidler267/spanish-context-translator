"use client"

import { BookMarked, Clock, Globe, X } from "lucide-react"
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

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

interface ContentPreviewModalProps {
  content: ContentItem | null
  open: boolean
  onClose: () => void
}

export function ContentPreviewModal({ content, open, onClose }: ContentPreviewModalProps) {
  if (!content) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden border-border/50 bg-card p-0 font-sans">
        <div className="relative h-48 overflow-hidden">
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
              <ContentTypeBadge type={content.type} size="md" />
              <Badge
                variant="outline"
                className={`${difficultyColors[content.difficulty]} border`}
              >
                {difficultyLabels[content.difficulty]}
              </Badge>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
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
                className="rounded-full border border-border/70 bg-muted px-3 py-1 text-sm font-medium text-foreground"
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
            <ScrollArea className="h-48 rounded-lg border border-border/50 bg-background/50 p-4">
              <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                {content.preview}
              </p>
            </ScrollArea>
          </div>

          <div className="flex gap-3">
            <Button className="flex-1" size="lg">
              Start Reading
            </Button>
            <Button variant="outline" size="lg">
              Add to Library
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
