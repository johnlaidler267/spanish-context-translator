"use client"

import type { ReactNode } from "react"
import { BookOpen, Clock, Feather, FileText, Music } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ContentItem, ContentType, DifficultyLevel } from "@/lib/content-data"
import { difficultyColors } from "@/lib/content-data"

const typeIcons: Record<ContentType, ReactNode> = {
  book: <BookOpen className="size-4" />,
  article: <FileText className="size-4" />,
  song: <Music className="size-4" />,
  poem: <Feather className="size-4" />,
}

const typeLabels: Record<ContentType, string> = {
  book: "Book",
  article: "Article",
  song: "Song",
  poem: "Poem",
}

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
      className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={content.coverImage}
          alt={content.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
          {typeIcons[content.type]}
          <span>{typeLabels[content.type]}</span>
        </div>

        <div className="absolute bottom-3 left-3 right-3">
          <Badge
            variant="outline"
            className={`${difficultyColors[content.difficulty]} border text-xs`}
          >
            {difficultyLabels[content.difficulty]}
          </Badge>
        </div>
      </div>

      <CardContent className="p-4">
        <h3 className="mb-1 line-clamp-1 font-serif font-bold text-foreground transition-colors group-hover:text-primary">
          {content.title}
        </h3>
        <p className="mb-3 font-reading text-sm text-muted-foreground">{content.author}</p>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {content.estimatedTime}
          </span>
          <span>{content.wordCount.toLocaleString()} words</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {content.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
