"use client"

import type { CSSProperties, KeyboardEvent } from "react"
import { BookOpen, Trash2 } from "lucide-react"
import type { LibraryEpub } from "@/lib/storage/epub-library"

/**
 * Visually a sibling of Discover's ContentCard/DiscoverCoverArt (reuses the same `.discover-*`
 * CSS so a personal upload reads as "the same kind of thing" as a Discover book) but doesn't
 * force a saved EPUB into the full `ContentItem` shape -- there's no real difficulty/language/
 * word-count for a user's own upload, and showing a made-up "Beginner" badge on every book
 * would just be wrong information.
 */

const COVER_PALETTE = [
  { accent: "#b86b4e", ink: "#4a2c1c", wash: "#f1dcc8" },
  { accent: "#a55f3f", ink: "#452a1e", wash: "#ecd8c1" },
  { accent: "#8f6a2e", ink: "#3f3117", wash: "#f0e3c7" },
] as const

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

interface LibraryCardProps {
  book: LibraryEpub
  /** 1-100, or null when this book hasn't been paged through yet (never opened, or opened but
   *  no page-count recorded). */
  progressPercent: number | null
  onOpen: () => void
  onDelete: () => void
}

export function LibraryCard({ book, progressPercent, onOpen, onDelete }: LibraryCardProps) {
  const palette = COVER_PALETTE[hashString(book.title) % COVER_PALETTE.length]!
  const coverStyle = {
    "--cover-accent": palette.accent,
    "--cover-ink": palette.ink,
    "--cover-wash": palette.wash,
  } as CSSProperties

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onOpen()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={
        progressPercent != null
          ? `Continue reading ${book.title}, ${progressPercent}% read`
          : `Start reading ${book.title}`
      }
      className="discover-card"
    >
      <div className="discover-card__frame">
        <div className="discover-cover discover-cover--plate" style={coverStyle}>
          <span className="discover-cover__rule" aria-hidden />
          <BookOpen className="discover-cover__motif" aria-hidden />
          <p className="discover-cover__plate-title">{book.title}</p>
        </div>
        <span className="discover-card__type">Book</span>
        {progressPercent != null && (
          <span className="discover-card__progress">{progressPercent}% read</span>
        )}

        <div className="discover-card__tools">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`Remove ${book.title} from your library`}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="discover-card__body">
        <h3 className="discover-card__title">{book.title}</h3>
        <div className="discover-card__meta">
          <span className="discover-card__time">
            {progressPercent != null ? "In progress" : `${book.charCount.toLocaleString()} characters`}
          </span>
        </div>
      </div>
    </div>
  )
}
