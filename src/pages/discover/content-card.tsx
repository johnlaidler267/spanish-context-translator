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
  const summary = content.preview.trim() ? content.preview : `by ${content.author}`

  return (
    <Card
      className="group min-w-0 cursor-pointer overflow-hidden rounded-[1.65rem] border border-[#d9cfbf] bg-[#fbf8f2]/96 shadow-[0_10px_30px_rgba(76,56,39,0.08)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#cfa38d] hover:shadow-[0_18px_40px_rgba(76,56,39,0.14)] dark:border-border/80 dark:bg-[#1d201f] dark:hover:border-primary/40"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <DiscoverCoverArt content={content} variant="card" className="h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-[#f6f1e8]/95 via-[#f6f1e8]/82 to-transparent dark:from-[rgba(26,26,26,0.92)] dark:via-[rgba(26,26,26,0.78)]" />
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

        <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.74rem] font-semibold tracking-[-0.01em] shadow-[0_1px_0_rgba(255,255,255,0.32)_inset] backdrop-blur-sm",
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

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <div className="rounded-[1.3rem] border border-white/45 bg-[rgba(252,248,241,0.72)] p-5 shadow-[0_14px_30px_rgba(76,56,39,0.10)] backdrop-blur-md dark:border-white/8 dark:bg-[rgba(34,34,32,0.72)] dark:shadow-[0_14px_30px_rgba(0,0,0,0.18)]">
            <p className="mb-2 font-reading text-[1rem] italic leading-none text-[#6a5d54] dark:text-muted-foreground">
              {content.author}
            </p>
            <h3 className="text-balance font-reading text-[2rem] leading-[0.92] tracking-[-0.04em] text-[#2d2621] dark:text-foreground sm:text-[2.2rem]">
              {content.title}
            </h3>
            <div className="mt-4 flex items-center justify-between gap-3 text-[0.78rem] font-medium uppercase tracking-[0.08em] text-[#6f6258] dark:text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5">
                <Clock className="size-3.5 shrink-0" />
                {content.estimatedTime}
              </span>
              <span className="shrink-0 tabular-nums">{content.wordCount.toLocaleString()} words</span>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="border-t border-[#e5dccf] bg-[linear-gradient(to_bottom,rgba(249,245,237,0.96),rgba(245,240,231,0.98))] p-5 dark:border-border/70 dark:bg-[linear-gradient(to_bottom,#242624,#1d201f)]">
        <p className="line-clamp-3 text-pretty font-sans text-[0.96rem] leading-6 text-[#433a34]/78 dark:text-muted-foreground">
          {summary}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {content.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#d8cfbf] bg-[#f3ede2] px-2.5 py-1 text-[0.72rem] font-medium uppercase tracking-[0.05em] text-[#5f534b] dark:border-[#cfc4b3] dark:bg-[#f3ede2] dark:text-[#5f534b]"
            >
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
