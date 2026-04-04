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
import { TextChunk, shouldGlueAfterPriorChunk } from "./text-chunk"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getChunkIdFromPointerClientXY,
  useChunkTouchExploration,
} from "@/hooks/use-chunk-touch-exploration"
import { DetailsBox } from "./details-box"
import { useChunkDetails } from "@/hooks/use-chunk-details"
import { MobileReadingEdgeTurn } from "./mobile-reading-edge-turn"
import { useReadingPageEnterAnimation } from "@/hooks/use-reading-page-enter"

interface ChunkData {
  id: number
  text: string
  meaning: string
  literal?: string
  grammar?: string
}

interface Sentence {
  id: number
  chunks: ChunkData[]
}

interface ReadModeProps {
  /** Increment when starting a new reading session (resets sentence index). */
  readingSessionKey?: number
  /** Current article / LLM page — when it changes, step index resets (or lands on last via nonce). */
  readPageKey: number
  /** Read steps on earlier article pages (same merge/subdivide as parent) — for cumulative “slide” label. */
  readStepOffset: number
  /**
   * Increment when navigating to the previous article page from the first read step
   * so the last step of that page is selected (parent bumps with `goReadPrevArticlePage`).
   */
  enterAtLastStepNonce: number
  lastConsumedEnterNonce: number
  onConsumeEnterLastStep: (nonce: number) => void
  /** One step per item; desktop = fixed character count per step. Mobile splits long sentences into smaller chunk groups. */
  sentences: Sentence[]
  articlePageIndex: number
  totalPages: number
  onRequestNextArticlePage: () => void
  onRequestPrevArticlePage: () => void
  nextPageLoading: boolean
  nextPageOpen: boolean
  nextPageError?: string | null
  onRetryNextPage?: () => void
}

/** Brief delay before clearing hover over inter-chunk gaps (read + article pointer paths). */
const CHUNK_HOVER_GAP_CLEAR_MS = 90

export function ReadMode({
  readingSessionKey = 0,
  readPageKey,
  readStepOffset,
  enterAtLastStepNonce,
  lastConsumedEnterNonce,
  onConsumeEnterLastStep,
  sentences,
  articlePageIndex,
  totalPages,
  onRequestNextArticlePage,
  onRequestPrevArticlePage,
  nextPageLoading,
  nextPageOpen,
  nextPageError = null,
  onRetryNextPage,
}: ReadModeProps) {
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)
  /** Desktop hover: viewport position for tooltip arrow (read mode delegates pointer to parent) */
  const [tooltipPointer, setTooltipPointer] = useState<{ x: number; y: number } | null>(null)

  const prevPageKeyRef = useRef(readPageKey)
  /** Pointer hit-test: delayed clear when moving across spaces between words */
  const gapClearExploreTimerRef = useRef<number | null>(null)

  const cancelGapClearExplore = useCallback(() => {
    if (gapClearExploreTimerRef.current != null) {
      window.clearTimeout(gapClearExploreTimerRef.current)
      gapClearExploreTimerRef.current = null
    }
  }, [])

  const commitExploringChunkId = useCallback(
    (action: SetStateAction<number | null>) => {
      cancelGapClearExplore()
      setExploringChunkId(action)
    },
    [cancelGapClearExplore],
  )

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(
    commitExploringChunkId,
    currentSentenceIndex,
    sentences,
    { onTouchPointerClient: setTooltipPointer },
  )

  const pointerHoverRafRef = useRef<number | null>(null)
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null)
  const pointerLastIdRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = touchSurfaceRef.current
    if (!el) return

    const applyHit = (clientX: number, clientY: number) => {
      const id = getChunkIdFromPointerClientXY(clientX, clientY, el)

      if (id != null) {
        cancelGapClearExplore()
        if (id === pointerLastIdRef.current) return
        pointerLastIdRef.current = id
        setExploringChunkId((prev) => (prev === id ? prev : id))
        return
      }

      if (pointerLastIdRef.current == null) return
      if (gapClearExploreTimerRef.current != null) return
      gapClearExploreTimerRef.current = window.setTimeout(() => {
        gapClearExploreTimerRef.current = null
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
      // Update tooltip anchor every event; hit-test stays on rAF to avoid excess setState churn.
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
      cancelGapClearExplore()
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
      cancelGapClearExplore()
    }
  }, [readStepOffset, currentSentenceIndex, cancelGapClearExplore])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  const chunkDetails = useChunkDetails()

  const currentSentence = sentences[currentSentenceIndex] ?? { id: 0, chunks: [] as ChunkData[] }
  const totalSentences = sentences.length
  /** Linear read position — changes on every sentence (and article page) so enter anim can run per step */
  const readEnterAnimKey = readStepOffset + currentSentenceIndex
  const { pageEnterStyle } = useReadingPageEnterAnimation(readEnterAnimKey)

  /** Current sentence as plain text for LLM context */
  const currentSentenceText = useMemo(
    () => currentSentence.chunks.map((c: ChunkData) => c.text).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSentenceIndex, sentences],
  )

  useEffect(() => {
    prevPageKeyRef.current = readPageKey
    setCurrentSentenceIndex(0)
    // Only new submit / session — not article page changes (those use the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingSessionKey])

  useEffect(() => {
    if (sentences.length === 0) {
      setCurrentSentenceIndex(0)
      return
    }
    const keyChanged = readPageKey !== prevPageKeyRef.current
    if (keyChanged) prevPageKeyRef.current = readPageKey

    if (enterAtLastStepNonce > lastConsumedEnterNonce) {
      prevPageKeyRef.current = readPageKey
      setCurrentSentenceIndex(Math.max(0, sentences.length - 1))
      onConsumeEnterLastStep(enterAtLastStepNonce)
      return
    }
    if (keyChanged) {
      setCurrentSentenceIndex(0)
    }
  }, [
    readPageKey,
    enterAtLastStepNonce,
    lastConsumedEnterNonce,
    onConsumeEnterLastStep,
    sentences.length,
  ])

  useEffect(() => {
    setCurrentSentenceIndex((i) =>
      sentences.length === 0 ? 0 : Math.min(i, Math.max(0, sentences.length - 1)),
    )
  }, [sentences.length])

  const clearChunkUi = useCallback(() => {
    cancelGapClearExplore()
    setExploringChunkId(null)
    setPinnedChunkId(null)
    chunkDetails.close()
  }, [chunkDetails, cancelGapClearExplore])

  const handleGlobalClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        !target.closest("[data-chunk]") &&
        !target.closest("[data-popup]") &&
        !target.closest("[data-details-box]")
      ) {
        clearChunkUi()
      }
    },
    [clearChunkUi],
  )

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  const atLastStep = totalSentences === 0 || currentSentenceIndex >= totalSentences - 1
  const showNextPageLoading = atLastStep && nextPageLoading && articlePageIndex < totalPages - 1

  const goToPrevious = useCallback(() => {
    if (currentSentenceIndex > 0) {
      setCurrentSentenceIndex((i) => i - 1)
      clearChunkUi()
      return
    }
    if (articlePageIndex > 0) {
      onRequestPrevArticlePage()
      clearChunkUi()
    }
  }, [
    articlePageIndex,
    currentSentenceIndex,
    clearChunkUi,
    onRequestPrevArticlePage,
  ])

  const goToNext = useCallback(() => {
    if (currentSentenceIndex < totalSentences - 1) {
      setCurrentSentenceIndex((i) => i + 1)
      clearChunkUi()
      return
    }
    if (articlePageIndex < totalPages - 1 && nextPageOpen) {
      onRequestNextArticlePage()
      clearChunkUi()
    }
  }, [
    articlePageIndex,
    currentSentenceIndex,
    nextPageOpen,
    onRequestNextArticlePage,
    totalPages,
    totalSentences,
    clearChunkUi,
  ])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        if (currentSentenceIndex > 0) {
          setCurrentSentenceIndex((prev) => prev - 1)
          clearChunkUi()
        } else if (articlePageIndex > 0) {
          onRequestPrevArticlePage()
          clearChunkUi()
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        if (currentSentenceIndex < totalSentences - 1) {
          setCurrentSentenceIndex((prev) => prev + 1)
          clearChunkUi()
        } else if (articlePageIndex < totalPages - 1 && nextPageOpen) {
          onRequestNextArticlePage()
          clearChunkUi()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [
    articlePageIndex,
    currentSentenceIndex,
    totalPages,
    totalSentences,
    nextPageOpen,
    clearChunkUi,
    onRequestNextArticlePage,
    onRequestPrevArticlePage,
  ])

  const canGoPrevious = currentSentenceIndex > 0 || articlePageIndex > 0
  const canGoNextWithinPage = currentSentenceIndex < totalSentences - 1
  const canGoNextArticle =
    articlePageIndex < totalPages - 1 && nextPageOpen
  const canGoNext = canGoNextWithinPage || canGoNextArticle

  const prevDisabled = !canGoPrevious
  const nextDisabled = !canGoNext

  const edgeSwipeEnabled =
    totalSentences > 1 || articlePageIndex > 0 || articlePageIndex < totalPages - 1

  return (
    <div className="flex w-full flex-col max-md:h-full max-md:min-h-0 max-md:flex-1 md:min-h-[calc(100dvh-5rem)] px-6 md:px-8">
      {/* flex-1 + justify-center: sentence sits mid viewport; nav stays at bottom (shrink-0) */}
      <div className="relative mx-auto flex w-full min-h-0 max-w-[700px] flex-1 flex-col items-center justify-center max-md:pt-[max(5rem,calc(env(safe-area-inset-top,0px)+3.5rem))] md:pt-16">
        {showNextPageLoading && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[2px]"
            aria-busy
            aria-label="Loading next section"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
        <div
          key={readEnterAnimKey}
          ref={touchSurfaceRef}
          style={pageEnterStyle}
          className={cn(
            "block w-full font-serif text-3xl md:text-5xl lg:text-6xl max-md:leading-[1.52] md:leading-snug text-center text-foreground text-balance selection:bg-primary/20",
            touchExploring && "touch-none select-none",
          )}
        >
          {currentSentence.chunks.map((chunk: ChunkData, index: number) => {
            const next = currentSentence.chunks[index + 1]
            const gapAfter =
              next != null && !shouldGlueAfterPriorChunk(next.text) ? " " : ""
            return (
              <span key={chunk.id}>
                <TextChunk
                  chunk={chunk}
                  popupChunkId={effectivePopupId}
                  delegatePointerHover
                  followPointerClient={
                    effectivePopupId === chunk.id && tooltipPointer != null
                      ? tooltipPointer
                      : null
                  }
                  isTouchHighlight={exploringChunkId === chunk.id}
                  isPinned={pinnedChunkId === chunk.id}
                  onActivate={() => commitExploringChunkId(chunk.id)}
                  onDeactivate={() => {
                    if (pinnedChunkId !== chunk.id) commitExploringChunkId(null)
                  }}
                  onPinToggle={() =>
                    setPinnedChunkId((prev) => (prev === chunk.id ? null : chunk.id))
                  }
                  onRequestDetails={() => chunkDetails.fetchDetails(chunk.text, currentSentenceText)}
                />
                {gapAfter}
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-8 pb-12 pt-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevious}
          disabled={prevDisabled}
          className="h-12 w-12 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ChevronLeft className="h-6 w-6" />
          <span className="sr-only">Previous sentence</span>
        </Button>

        <span className="text-sm font-sans text-muted-foreground tabular-nums">
          {readStepOffset + currentSentenceIndex + 1} of {readStepOffset + totalSentences}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          disabled={nextDisabled}
          className="h-12 w-12 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30"
        >
          {atLastStep && nextPageLoading && canGoNextArticle ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          ) : (
            <ChevronRight className="h-6 w-6" />
          )}
          <span className="sr-only">Next sentence</span>
        </Button>
      </div>

      {nextPageError && onRetryNextPage && (
        <div className="shrink-0 border-t border-border/60 bg-muted/30 px-4 py-3 text-center">
          <p className="mb-2 font-sans text-sm text-muted-foreground">{nextPageError}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetryNextPage}>
            Retry loading next section
          </Button>
        </div>
      )}

      {edgeSwipeEnabled && (
        <MobileReadingEdgeTurn
          enabled
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={goToPrevious}
          onNext={goToNext}
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
