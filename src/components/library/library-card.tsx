"use client"

import { useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import { BookOpen, Loader2, Trash2 } from "lucide-react"
import type { LibraryEpub } from "@/lib/storage/epub-library"
import { cn } from "@/lib/utils"

/**
 * Visually a sibling of Discover's ContentCard/DiscoverCoverArt (reuses the same `.discover-*`
 * CSS so a personal upload reads as "the same kind of thing" as a Discover book) but doesn't
 * force a saved EPUB into the full `ContentItem` shape -- there's no real difficulty/language/
 * word-count for a user's own upload, and showing a made-up "Beginner" badge on every book
 * would just be wrong information.
 *
 * Cover art: when the upload had a real cover (see parse-epub.ts's `extractCoverImage`), that
 * image is shown -- same `.discover-cover__img`/`.discover-cover__vignette` markup as
 * DiscoverCoverArt uses for a Discover item's real cover, including its `onError` fallback for
 * a `data:` URL that somehow fails to decode. Otherwise (no cover, or the image failed to load)
 * this falls back to the same generated placeholder plate as before.
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
  /** Omitted on the landing page's Continue Reading row -- deleting a book isn't an action that
   *  row offers, so no trash icon is rendered there (see ContentCard's own onDelete, which is
   *  optional for the same reason). */
  onDelete?: () => void
  /** True while this card's own tap is still resolving -- fetching the saved book's text (and
   *  re-checking auth) before the reader can open, see LibraryPage's handleOpenBook. Swaps the
   *  cover icon for a spinner so a tap on a slow connection reads as "working", not "nothing
   *  happened". */
  isOpening?: boolean
  /** True while a *different* card is opening -- dims this one and ignores taps so a second
   *  tap can't kick off a second concurrent open. */
  disabled?: boolean
}

export function LibraryCard({
  book,
  progressPercent,
  onOpen,
  onDelete,
  isOpening = false,
  disabled = false,
}: LibraryCardProps) {
  const [coverBroken, setCoverBroken] = useState(false)
  const coverImage = book.coverImage
  const showCoverImage = Boolean(coverImage) && !coverBroken

  const palette = COVER_PALETTE[hashString(book.title) % COVER_PALETTE.length]!
  const coverStyle = {
    "--cover-accent": palette.accent,
    "--cover-ink": palette.ink,
    "--cover-wash": palette.wash,
  } as CSSProperties

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onOpen()
  }

  /**
   * Touch fallback for the long-standing "first tap on a library book does nothing, the second
   * one works" report (see fa4efac and b1c67aa, which each fixed a different contributing cause
   * and neither of which closed it out).
   *
   * A `click` from a touchscreen is *derived*: the browser decides after the gesture finishes
   * whether the touch was a tap at all, and can simply decline to fire `click` -- e.g. when the
   * finger drifted enough to look like the start of a scroll, or when the gesture also moved the
   * mobile URL bar. Nothing in React sees that; the tap just vanishes, and the next tap (with the
   * page now settled) works. Rather than keep guessing at which specific heuristic is suppressing
   * it, open on `pointerup` for touch pointers directly, with our own tap test: the pointer must
   * not have travelled more than TAP_SLOP_PX, must not have been cancelled (`pointercancel` is
   * how the browser says "this became a scroll"), and must have lasted less than TAP_MAX_MS.
   *
   * `suppressClickUntil` then swallows the synthetic `click` the browser may still deliver right
   * after, so `onOpen` runs exactly once per tap. That matters here: on the Library page `onOpen`
   * just shows the preview modal (idempotent), but the landing page's Continue Reading row wires
   * the same card straight into opening a book.
   */
  const TAP_SLOP_PX = 10
  const TAP_MAX_MS = 700
  const CLICK_SUPPRESS_MS = 900
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null)
  const suppressClickUntil = useRef(0)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return
    touchStart.current = { x: event.clientX, y: event.clientY, time: Date.now() }
  }

  const handlePointerCancel = () => {
    touchStart.current = null
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return
    const start = touchStart.current
    touchStart.current = null
    if (disabled || !start) return
    if (Date.now() - start.time > TAP_MAX_MS) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return
    // A tap on the delete button bubbles up here too -- that button stops the *click*, but
    // pointer events reach us first, so check the real target before treating it as a card tap.
    if (event.target instanceof Element && event.target.closest(".discover-card__tools")) return
    suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS
    onOpen()
  }

  const handleClick = () => {
    if (disabled) return
    if (Date.now() < suppressClickUntil.current) {
      suppressClickUntil.current = 0
      return
    }
    onOpen()
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      aria-busy={isOpening || undefined}
      aria-label={
        progressPercent != null
          ? `Continue reading ${book.title}, ${progressPercent}% read`
          : `Start reading ${book.title}`
      }
      className={cn("discover-card", disabled && "pointer-events-none opacity-60")}
    >
      <div className="discover-card__frame">
        <div
          className={cn("discover-cover", !showCoverImage && "discover-cover--plate")}
          style={showCoverImage ? undefined : coverStyle}
        >
          {showCoverImage ? (
            <>
              <img
                src={coverImage!}
                alt=""
                loading="lazy"
                decoding="async"
                className="discover-cover__img"
                onError={() => setCoverBroken(true)}
              />
              <div className="discover-cover__vignette" aria-hidden />
              {isOpening && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <Loader2 className="discover-cover__motif animate-spin text-white" aria-hidden />
                </div>
              )}
            </>
          ) : (
            <>
              <span className="discover-cover__rule" aria-hidden />
              {isOpening ? (
                <Loader2 className="discover-cover__motif animate-spin" aria-hidden />
              ) : (
                <BookOpen className="discover-cover__motif" aria-hidden />
              )}
              <p className="discover-cover__plate-title">{book.title}</p>
            </>
          )}
        </div>
        <span className="discover-card__type">Book</span>
        {progressPercent != null && (
          <span className="discover-card__progress">{progressPercent}% read</span>
        )}

        {onDelete && (
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
        )}
      </div>

      <div className="discover-card__body">
        {book.author && <p className="discover-card__author">{book.author}</p>}
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
