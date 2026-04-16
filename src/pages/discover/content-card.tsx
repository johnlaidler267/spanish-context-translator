"use client"

import { Clock } from "lucide-react"
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
}

export function ContentCard({ content, onClick }: ContentCardProps) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary/45 hover:bg-card hover:shadow-md hover:shadow-primary/5"
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
        <h3 className="mb-1.5 line-clamp-1 font-serif font-bold text-black transition-colors group-hover:text-primary dark:text-foreground">
          {content.title}
        </h3>
        <p className="mb-4 font-reading text-sm text-black dark:text-muted-foreground">{content.author}</p>

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
