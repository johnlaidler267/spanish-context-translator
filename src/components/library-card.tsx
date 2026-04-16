"use client"

import type { ReactNode } from "react"
import {
  BookOpen,
  Clock,
  Feather,
  FileText,
  MoreHorizontal,
  Music,
  Play,
  Trash2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ContentType, DifficultyLevel } from "@/lib/content-data"
import { difficultyColors } from "@/lib/content-data"
import type { LibraryItem } from "@/lib/library-data"

const typeIcons: Record<ContentType, ReactNode> = {
  book: <BookOpen className="size-4" />,
  article: <FileText className="size-4" />,
  song: <Music className="size-4" />,
  poem: <Feather className="size-4" />,
}

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

interface LibraryCardProps {
  item: LibraryItem
  showProgress?: boolean
  onClick: () => void
  onRemove: () => void
}

export function LibraryCard({ item, showProgress = false, onClick, onRemove }: LibraryCardProps) {
  return (
    <Card className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex gap-4 p-4">
        <div
          className="relative h-32 w-24 flex-shrink-0 overflow-hidden rounded-lg"
          onClick={onClick}
        >
          <img
            src={item.coverImage}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
          <div className="absolute bottom-2 left-2">
            <div className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
              {typeIcons[item.type]}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between" onClick={onClick}>
          <div>
            <div className="mb-1 flex items-start justify-between">
              <h3 className="line-clamp-1 font-semibold text-foreground transition-colors group-hover:text-primary">
                {item.title}
              </h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove()
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">{item.author}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`${difficultyColors[item.difficulty]} border text-xs`}
              >
                {difficultyLabels[item.difficulty]}
              </Badge>
              <span className="text-xs text-muted-foreground">{item.language}</span>
            </div>
          </div>

          <div className="mt-3">
            {showProgress && item.progress !== undefined ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium text-primary">{item.progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {item.estimatedTime}
                </span>
                <span>{item.wordCount.toLocaleString()} words</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showProgress ? (
        <div className="border-t border-border/50 px-4 py-3">
          <Button onClick={onClick} className="w-full gap-2" size="sm">
            <Play className="size-4" />
            Continue Reading
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
