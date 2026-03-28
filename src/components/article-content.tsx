"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { TextChunk } from "./text-chunk"
import { gapBetweenReconciledChunks, type ReconciledItem } from "@/lib/translate"
import { useChunkTouchExploration } from "@/hooks/use-chunk-touch-exploration"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { READING_CONTENT_TOP_MOBILE_REM } from "@/lib/reading-layout"
import { DetailsBox } from "./details-box"
import { useChunkDetails } from "@/hooks/use-chunk-details"

export type ArticlePaginationState = {
  pageIndex: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  /** Next page is in flight (show on Next control). */
  nextPageLoading: boolean
  /** User can open the next page (cached or errored — errored page shows retry there). */
  nextPageOpen: boolean
}

interface ArticleContentProps {
  items: ReconciledItem[] | null
  /** Initial load for current page */
  loading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
  pagination?: ArticlePaginationState | null
  /** Bumps chunk popup state when switching pages */
  pageKey?: number
}

export function ArticleContent({
  items,
  loading = false,
  errorMessage = null,
  onRetry,
  pagination = null,
  pageKey = 0,
}: ArticleContentProps) {
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(setExploringChunkId, [
    items,
    pageKey,
  ])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  // Details box state
  const chunkDetails = useChunkDetails()

  /** Reconstruct full page text for LLM sentence context */
  const pageText = useMemo(() => {
    if (!items) return ""
    return items.map(item => item.type === "text" ? item.text : item.chunk).join("")
  }, [items])

  const handleGlobalClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      !target.closest("[data-chunk]") &&
      !target.closest("[data-popup]") &&
      !target.closest("[data-details-box]")
    ) {
      setExploringChunkId(null)
      setPinnedChunkId(null)
      chunkDetails.close()
    }
  }, [chunkDetails])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  let chunkId = 0

  return (
    <div
      className={cn(
        "w-full mx-auto px-6 md:px-8 md:pt-24 max-md:pt-[calc(env(safe-area-inset-top,0px)+var(--reading-content-top))] pb-10 md:pb-16",
        "flex w-full flex-1 flex-col min-h-0",
        /* Stretch column to viewport under header (mobile + desktop) */
        "max-md:min-h-[calc(100dvh-9.5rem-env(safe-area-inset-bottom,0px))]",
        "md:min-h-[calc(100dvh-7.25rem)]",
      )}
      style={{
        maxWidth: "700px",
        ["--reading-content-top" as string]: `${READING_CONTENT_TOP_MOBILE_REM}rem`,
      }}
    >
      <article
        ref={touchSurfaceRef}
        className={cn(
          "font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground selection:bg-primary/20",
          "min-h-0 flex-1 md:mb-8",
          touchExploring && "touch-none select-none",
        )}
      >
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground font-sans text-base py-8">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
            <span>Translating this page…</span>
          </div>
        )}
        {!loading && errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 font-sans text-sm text-destructive">
            <p className="mb-3">{errorMessage}</p>
            {onRetry && (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry translation
              </Button>
            )}
          </div>
        )}
        {!loading && !errorMessage && items && (
          <>
            {items.map((item, i) => {
              if (item.type === "text") {
                return <span key={i}>{item.text}</span>
              }
              const prev = i > 0 ? items[i - 1] : null
              const gap =
                prev?.type === "chunk" ? gapBetweenReconciledChunks(prev, item) : ""
              const id = chunkId++
              const chunkData = {
                id,
                text: item.chunk,
                meaning: item.meaning,
                literal: item.literal,
                grammar: item.note,
              }
              return (
                <span key={i}>
                  {gap ? <span aria-hidden="true">{gap}</span> : null}
                  <TextChunk
                    variant="article"
                    chunk={chunkData}
                    popupChunkId={effectivePopupId}
                    isTouchHighlight={exploringChunkId === id}
                    isPinned={pinnedChunkId === id}
                    onActivate={() => setExploringChunkId(id)}
                    onDeactivate={() => {
                      if (pinnedChunkId !== id) setExploringChunkId(null)
                    }}
                    onPinToggle={() => setPinnedChunkId(prev => (prev === id ? null : id))}
                    onRequestDetails={() => chunkDetails.fetchDetails(item.chunk, pageText)}
                  />
                </span>
              )
            })}
          </>
        )}
      </article>

      {pagination && pagination.pageCount > 1 && (
        <footer className="mt-auto flex shrink-0 items-center justify-between gap-4 border-t border-border/60 max-md:border-t-0 pt-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            disabled={pagination.pageIndex <= 0}
            onClick={pagination.onPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <span className="text-sm font-sans text-muted-foreground tabular-nums">
            Page {pagination.pageIndex + 1} of {pagination.pageCount}
          </span>
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled={
                pagination.pageIndex >= pagination.pageCount - 1 || !pagination.nextPageOpen
              }
              onClick={pagination.onNext}
              aria-label="Next page"
            >
              {pagination.nextPageLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
              ) : (
                <ChevronRight className="h-6 w-6" />
              )}
            </Button>
          </div>
        </footer>
      )}

      <DetailsBox
        activeChunk={chunkDetails.activeChunk}
        detail={chunkDetails.detail}
        loading={chunkDetails.loading}
        error={chunkDetails.error}
        onClose={chunkDetails.close}
      />
    </div>
  )
}
