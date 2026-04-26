"use client"

import { Clock, Pencil, Trash2 } from "lucide-react"
import { DiscoverCoverArt } from "@/components/discover/discover-cover-art"
import { Card, CardContent } from "@/components/ui/card"
import type { ContentItem, DifficultyLevel } from "@/lib/content-data"
import { cn } from "@/lib/utils"

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

const difficultyPillStyles: Record<DifficultyLevel, { shell: string; barActive: string }> = {
  beginner:
    {
      shell: "border-[#73d8bc] bg-[#edf8f3] text-[#0f5f4c]",
      barActive: "bg-[#31b18f]",
    },
  intermediate:
    {
      shell: "border-[#b5b6ff] bg-[#f1f0ff] text-[#4741a3]",
      barActive: "bg-[#7672eb]",
    },
  advanced:
    {
      shell: "border-[#f0b4c8] bg-[#fff1f6] text-[#9c3f66]",
      barActive: "bg-[#df6f97]",
    },
}

const difficultyBarCount: Record<DifficultyLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
}

function normalizeDifficulty(level: string): DifficultyLevel {
  const key = level.trim().toLowerCase()
  if (key === "advanced" || key === "intermediate" || key === "beginner") return key
  return "beginner"
}

interface ContentCardProps {
  content: ContentItem
  onClick: () => void
  onDelete?: (id: string) => void
  onEdit?: () => void
}

export function ContentCard({ content, onClick, onDelete, onEdit }: ContentCardProps) {
  const difficulty = normalizeDifficulty(content.difficulty)

  return (
    <Card
      className="group min-w-0 cursor-pointer overflow-hidden rounded-none border-2 border-border/80 bg-card/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary/55 hover:bg-card hover:shadow-md hover:shadow-primary/5"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <DiscoverCoverArt content={content} variant="card" className="h-full w-full" />
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
          <div
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[11px] border px-2.5 text-[0.74rem] font-semibold tracking-[-0.01em] shadow-[0_1px_0_rgba(255,255,255,0.32)_inset]",
              difficultyPillStyles[difficulty].shell,
            )}
          >
            <span className="inline-flex items-center gap-1" aria-hidden>
              {Array.from({ length: 3 }).map((_, index) => (
                <span
                  key={`${content.id}-difficulty-bar-${index}`}
                  className={cn(
                    "h-3 w-[0.32rem] rounded-full",
                    index < difficultyBarCount[difficulty]
                      ? difficultyPillStyles[difficulty].barActive
                      : "bg-[#d8d7d2]",
                  )}
                />
              ))}
            </span>
            <span>{difficultyLabels[difficulty]}</span>
          </div>
        </div>
      </div>

      <CardContent className="p-5 sm:p-6">
        <p className="mb-4 line-clamp-3 font-sans text-sm leading-6 text-black/75 dark:text-muted-foreground">
          {content.preview}
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
