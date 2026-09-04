"use client"

import type { KeyboardEvent } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { DiscoverCoverArt } from "@/components/discover/discover-cover-art"
import { DifficultyMark, normalizeDifficulty } from "@/components/discover/difficulty-mark"
import { contentTypeLabels } from "@/lib/discover/content-data"
import type { ContentItem } from "@/lib/discover/content-data"
import { cn } from "@/lib/utils"

interface ContentCardProps {
  content: ContentItem
  onClick: () => void
  /** Larger landscape treatment used by the spotlight row. */
  featured?: boolean
  onDelete?: (id: string) => void
  onEdit?: () => void
  /** 1-100. Shown as a small pill on the cover (landing page's Continue Reading row). */
  progressPercent?: number | null
}

export function ContentCard({
  content,
  onClick,
  featured = false,
  onDelete,
  onEdit,
  progressPercent,
}: ContentCardProps) {
  const difficulty = normalizeDifficulty(content.difficulty)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onClick()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`${content.title} by ${content.author}`}
      className={cn("discover-card", featured && "discover-card--featured")}
    >
      <div className="discover-card__frame">
        <DiscoverCoverArt content={content} className="discover-card__art" eager={featured} />
        <span className="discover-card__type">{contentTypeLabels[content.type]}</span>
        {progressPercent != null && (
          <span className="discover-card__progress">{progressPercent}% read</span>
        )}

        {(onEdit || onDelete) && (
          <div className="discover-card__tools">
            {onEdit && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit()
                }}
                aria-label={`Edit ${content.title}`}
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(content.id)
                }}
                aria-label={`Delete ${content.title}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="discover-card__body">
        <p className="discover-card__author">{content.author}</p>
        <h3 className="discover-card__title">{content.title}</h3>
        <div className="discover-card__meta">
          <DifficultyMark level={difficulty} />
          <span className="discover-card__time">
            {featured ? `${content.wordCount.toLocaleString()} words · ` : ""}
            {content.estimatedTime}
          </span>
        </div>
      </div>
    </div>
  )
}
