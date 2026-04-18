"use client"

import { Clock, Pencil, Trash2 } from "lucide-react"
import { ContentTypeBadge } from "@/components/discover/content-type-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ContentItem, DifficultyLevel } from "@/lib/content-data"
import { difficultyColors } from "@/lib/content-data"

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

interface ContentCardProps {
  content: ContentItem
  onClick: () => void
  onDelete?: (id: string) => void
  onEdit?: () => void
}

export function ContentCard({ content, onClick, onDelete, onEdit }: ContentCardProps) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden rounded-none border-2 border-border/80 bg-card/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary/55 hover:bg-card hover:shadow-md hover:shadow-primary/5"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={content.coverImage}
          alt={content.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

        <ContentTypeBadge type={content.type} size="sm" className="absolute left-4 top-4" />
        {(onEdit || onDelete) && (
          <div className="absolute right-4 top-4 flex gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit()
                }}
                className="rounded-md border border-border/60 bg-background/85 p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                aria-label={`Edit ${content.title}`}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(content.id)
                }}
                className="rounded-md border border-border/60 bg-background/85 p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                aria-label={`Delete ${content.title}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4">
          <Badge
            variant="outline"
            className={`${difficultyColors[content.difficulty]} border text-xs`}
          >
            {difficultyLabels[content.difficulty]}
          </Badge>
        </div>
      </div>

      <CardContent className="p-5 sm:p-6">
        <h3 className="mb-2 line-clamp-2 font-serif text-lg font-semibold leading-snug text-black transition-colors group-hover:text-primary dark:text-foreground">
          {content.title}
        </h3>
        <p className="mb-4 font-serif text-xs font-normal italic text-black/80 dark:text-muted-foreground">
          {content.author}
        </p>

        <div className="flex items-center justify-between gap-3 text-xs text-black dark:text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <Clock className="size-3 shrink-0" />
            {content.estimatedTime}
          </span>
          <span className="shrink-0 tabular-nums">{content.wordCount.toLocaleString()} words</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {content.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-xs font-medium text-black dark:text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
