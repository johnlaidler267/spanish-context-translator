"use client"

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  type SetStateAction,
} from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { TextChunk } from "./text-chunk"
import { gapBetweenReconciledChunks, type ReconciledItem } from "@/lib/translate"
import {
  getChunkIdFromPointerClientXY,
  useChunkTouchExploration,
} from "@/hooks/use-chunk-touch-exploration"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { READING_CONTENT_TOP_MOBILE_REM } from "@/lib/reading-layout"
import { DetailsBox } from "./details-box"
import { useChunkDetails } from "@/hooks/use-chunk-details"
import { MobileReadingEdgeTurn } from "./mobile-reading-edge-turn"
import { useReadingPageEnterAnimation } from "@/hooks/use-reading-page-enter"

export type ArticlePaginationState = {
  pageIndex: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  /** Next page is in flight after user chose Next (spinner on control until advance). */
  nextPageLoading: boolean
  /** User can request the next page (current page ready; load runs on Next if not cached). */
  nextPageOpen: boolean
}

interface ArticleContentProps {
  items: ReconciledItem[] | null
  loading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
  pagination?: ArticlePaginationState | null
  pageKey?: number
  /** Optional heading — shown bold above body on page 1 only */
  articleHeading?: string | null
}

const CHUNK_HOVER_GAP_CLEAR_MS = 90

export function ArticleContent({
  items,
  loading = false,
  errorMessage = null,
  onRetry,
  pagination = null,
  pageKey = 0,
  articleHeading = null,
}: ArticleContentProps) {
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)
  const [tooltipPointer, setTooltipPointer] = useState<{ x: number; y: number } | null>(null)
  const tooltipFollowRef = useRef<{ x: number; y: number } | null>(null)
  const exploringLeaveTimerRef = useRef<number | null>(null)
  const pointerHoverRafRef = useRef<number | null>(null)
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null)
  const pointerLastIdRef = useRef<number | null>(null)

  const cancelExploringLeaveTimer = useCallback(() => {
    if (exploringLeaveTimerRef.current != null) {
      window.clearTimeout(exploringLeaveTimerRef.current)
      exploringLeaveTimerRef.current = null
    }
  }, [])

  const commitExploringChunkId = useCallback(
    (action: SetStateAction<number | null>) => {
      cancelExploringLeaveTimer()
      setExploringChunkId(action)
    },
    [cancelExploringLeaveTimer],
  )

  const scheduleExploringLeave = useCallback(() => {
    cancelExploringLeaveTimer()
    exploringLeaveTimerRef.current = window.setTimeout(() => {
      exploringLeaveTimerRef.current = null
      setExploringChunkId(null)
    }, CHUNK_HOVER_GAP_CLEAR_MS)
  }, [cancelExploringLeaveTimer])

  useEffect(() => () => cancelExploringLeaveTimer(), [cancelExploringLeaveTimer])

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(
    commitExploringChunkId,
    items,
    pageKey,
    { onTouchPointerClient: (pt) => { tooltipFollowRef.current = pt } },
  )

  useLayoutEffect(() => {
    const el = touchSurfaceRef.current
    if (!el) return

    const applyHit = (clientX: number, clientY: number) => {
      const id = getChunkIdFromPointerClientXY(clientX, clientY, el)

      if (id != null) {
        cancelExploringLeaveTimer()
        if (id === pointerLastIdRef.current) return
        pointerLastIdRef.current = id
        setExploringChunkId((prev) => (prev === id ? prev : id))
        return
      }

      if (pointerLastIdRef.current == null) return
      if (exploringLeaveTimerRef.current != null) return
      exploringLeaveTimerRef.current = window.setTimeout(() => {
        exploringLeaveTimerRef.current = null
        pointerLastIdRef.current = null
        setExploringChunkId(null)
      }, CHUNK_HOVER_GAP_CLEAR_MS)
    }

    const flushHitTest = () => {
      pointerHoverRafRef.current = null
      const p = pointerPendingRef.current
      if (!p) return
      applyHit(p.x, p.y)
      setTooltipPointer({ x: p.x, y: p.y })
    }

    const onMouseEnter = (e: MouseEvent) => {
      pointerPendingRef.current = { x: e.clientX, y: e.clientY }
      setTooltipPointer({ x: e.clientX, y: e.clientY })
      applyHit(e.clientX, e.clientY)
    }

    const onMouseMove = (e: MouseEvent) => {
      pointerPendingRef.current = { x: e.clientX, y: e.clientY }
      setTooltipPointer({ x: e.clientX, y: e.clientY })
      if (pointerHoverRafRef.current != null) return
      pointerHoverRafRef.current = requestAnimationFrame(flushHitTest)
    }

    const onMouseLeave = (e: MouseEvent) => {
      const rt = e.relatedTarget
      if (
        rt instanceof Element &&
        (rt.closest("[data-popup]") || rt.closest("[data-details-box]"))
      ) {
        return
      }
      cancelExploringLeaveTimer()
      pointerPendingRef.current = null
      pointerLastIdRef.current = null
      setTooltipPointer(null)
      if (pointerHoverRafRef.current != null) {
        cancelAnimationFrame(pointerHoverRafRef.current)
        pointerHoverRafRef.current = null
      }
      setExploringChunkId(null)
    }

    el.addEventListener("mouseenter", onMouseEnter, { passive: true })
    el.addEventListener("mousemove", onMouseMove, { passive: true })
    el.addEventListener("mouseleave", onMouseLeave)
    return () => {
      el.removeEventListener("mouseenter", onMouseEnter)
      el.removeEventListener("mousemove", onMouseMove)
      el.removeEventListener("mouseleave", onMouseLeave)
      if (pointerHoverRafRef.current != null) {
        cancelAnimationFrame(pointerHoverRafRef.current)
        pointerHoverRafRef.current = null
      }
      pointerPendingRef.current = null
      pointerLastIdRef.current = null
      cancelExploringLeaveTimer()
    }
  }, [pageKey, cancelExploringLeaveTimer])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  // Details box state
  const chunkDetails = useChunkDetails()
  const { pageEnterStyle } = useReadingPageEnterAnimation(pageKey)

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
      cancelExploringLeaveTimer()
      setTooltipPointer(null)
      setExploringChunkId(null)
      setPinnedChunkId(null)
      chunkDetails.close()
    }
  }, [chunkDetails, cancelExploringLeaveTimer])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  let chunkId = 0

  return (
    <div
      className={cn(
        "w-full mx-auto px-6 md:px-8 md:pt-24 pb-10 md:pb-16",
        pagination && pagination.pageCount > 1
          ? "max-md:pb-[max(5.5rem,env(safe-area-inset-bottom,0px)+4.5rem)]"
          : "max-md:pb-[max(2.5rem,env(safe-area-inset-bottom,0px)+1.5rem)]",
        articleHeading
          ? "max-md:pt-[calc(env(safe-area-inset-top,0px)+5rem)]"
          : "max-md:pt-[calc(env(safe-area-inset-top,0px)+var(--reading-content-top))]",
        "flex w-full flex-1 flex-col min-h-0 max-md:overflow-hidden",
        "md:min-h-[calc(100dvh-7.25rem)]",
      )}
      style={{
        maxWidth: "700px",
        ["--reading-content-top" as string]: `${READING_CONTENT_TOP_MOBILE_REM}rem`,
      }}
    >
      {articleHeading ? (
        <h1 className="mb-4 shrink-0 font-sans text-xl font-bold leading-snug tracking-tight text-foreground md:mb-6 md:text-2xl">
          {articleHeading}
        </h1>
      ) : null}
      <article
        key={pageKey}
        ref={touchSurfaceRef}
        style={pageEnterStyle}
        className={cn(
          "font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground selection:bg-primary/20",
          "min-h-0 flex-1 md:mb-8 max-md:overflow-y-auto max-md:overscroll-y-contain",
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
                    delegatePointerHover
                    followPointerRef={
                      touchExploring && effectivePopupId === id
                        ? tooltipFollowRef
                        : undefined
                    }
                    followPointerClient={
                      !touchExploring &&
                      effectivePopupId === id &&
                      tooltipPointer != null
                        ? tooltipPointer
                        : null
                    }
                    followPointerSnap={touchExploring}
                    isTouchHighlight={exploringChunkId === id}
                    isPinned={pinnedChunkId === id}
                    onActivate={() => commitExploringChunkId(id)}
                    onDeactivate={() => {
                      if (pinnedChunkId !== id) scheduleExploringLeave()
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
        <footer className={cn(
          "flex items-center justify-between gap-4",
          // Desktop: in-flow, pushed to bottom by mt-auto
          "mt-auto shrink-0 border-t border-border/60 pt-8",
          // Mobile: fixed to screen bottom, always visible
          "max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-30",
          "max-md:mt-0 max-md:border-t max-md:border-border/40 max-md:bg-background",
          "max-md:px-8 max-md:pt-3 max-md:pb-[max(1.25rem,env(safe-area-inset-bottom,0px)+0.5rem)]",
        )}>
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

      {pagination && pagination.pageCount > 1 && (
        <MobileReadingEdgeTurn
          enabled
          canGoPrevious={pagination.pageIndex > 0}
          canGoNext={
            pagination.pageIndex < pagination.pageCount - 1 && pagination.nextPageOpen
          }
          onPrevious={pagination.onPrevious}
          onNext={pagination.onNext}
        />
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
