"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { TextChunk, shouldGlueAfterPriorChunk } from "./text-chunk"
import { Button } from "@/components/ui/button"
import { useChunkTouchExploration } from "@/hooks/use-chunk-touch-exploration"
import type { PageSentenceRange } from "@/lib/translate"
import { DetailsBox } from "./details-box"
import { useChunkDetails } from "@/hooks/use-chunk-details"
import { MobileReadingEdgeTurn } from "./mobile-reading-edge-turn"

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
  /** One step per item; desktop = fixed character count per step. Mobile splits long sentences into smaller chunk groups. */
  sentences: Sentence[]
  /**
   * Per LLM page → global sentence index range (pages = article-mode word caps at submit).
   * Midpoint crossing preloads the next LLM page.
   */
  sentenceRangesByPage?: PageSentenceRange[]
  onRequestPreloadPage?: (pageIndex: number) => void
}

export function ReadMode({
  readingSessionKey = 0,
  sentences,
  sentenceRangesByPage,
  onRequestPreloadPage,
}: ReadModeProps) {
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(setExploringChunkId, [
    currentSentenceIndex,
    sentences,
  ])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  const chunkDetails = useChunkDetails()

  const currentSentence = sentences[currentSentenceIndex] ?? { id: 0, chunks: [] as ChunkData[] }
  const totalSentences = sentences.length

  /** Current sentence as plain text for LLM context */
  const currentSentenceText = useMemo(
    () => currentSentence.chunks.map((c: ChunkData) => c.text).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSentenceIndex, sentences],
  )

  useEffect(() => {
    setCurrentSentenceIndex(0)
  }, [readingSessionKey])

  useEffect(() => {
    setCurrentSentenceIndex((i) =>
      sentences.length === 0 ? 0 : Math.min(i, Math.max(0, sentences.length - 1)),
    )
  }, [sentences.length])

  useEffect(() => {
    if (!onRequestPreloadPage || !sentenceRangesByPage?.length) return
    const rb = sentenceRangesByPage.find(
      r => currentSentenceIndex >= r.start && currentSentenceIndex < r.end,
    )
    if (!rb) return
    const span = rb.end - rb.start
    const mid = rb.start + Math.floor(span / 2)
    if (currentSentenceIndex >= mid) {
      onRequestPreloadPage(rb.pageIndex + 1)
    }
  }, [currentSentenceIndex, sentenceRangesByPage, onRequestPreloadPage])

  const clearChunkUi = useCallback(() => {
    setExploringChunkId(null)
    setPinnedChunkId(null)
    chunkDetails.close()
  }, [chunkDetails])

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        if (currentSentenceIndex > 0) {
          setCurrentSentenceIndex(prev => prev - 1)
          clearChunkUi()
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        if (currentSentenceIndex < totalSentences - 1) {
          setCurrentSentenceIndex(prev => prev + 1)
          clearChunkUi()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [currentSentenceIndex, totalSentences, clearChunkUi])

  const goToPrevious = useCallback(() => {
    let moved = false
    setCurrentSentenceIndex((i) => {
      if (i <= 0) return i
      moved = true
      return i - 1
    })
    if (moved) clearChunkUi()
  }, [clearChunkUi])

  const goToNext = useCallback(() => {
    let moved = false
    setCurrentSentenceIndex((i) => {
      if (i >= totalSentences - 1) return i
      moved = true
      return i + 1
    })
    if (moved) clearChunkUi()
  }, [totalSentences, clearChunkUi])

  return (
    <div className="flex w-full flex-col max-md:h-full max-md:min-h-0 max-md:flex-1 md:min-h-[calc(100dvh-5rem)] px-6 md:px-8">
      {/* flex-1 + justify-center: sentence sits mid viewport; nav stays at bottom (shrink-0) */}
      <div className="mx-auto flex w-full min-h-0 max-w-[700px] flex-1 flex-col items-center justify-center max-md:pt-[max(5rem,calc(env(safe-area-inset-top,0px)+3.5rem))] md:pt-16">
        <div
          ref={touchSurfaceRef}
          className={`block w-full font-serif text-3xl md:text-5xl lg:text-6xl max-md:leading-[1.52] md:leading-snug text-center text-foreground text-balance selection:bg-primary/20 ${
            touchExploring ? "touch-none select-none" : ""
          }`}
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
                  isTouchHighlight={exploringChunkId === chunk.id}
                  isPinned={pinnedChunkId === chunk.id}
                  onActivate={() => setExploringChunkId(chunk.id)}
                  onDeactivate={() => {
                    if (pinnedChunkId !== chunk.id) setExploringChunkId(null)
                  }}
                  onPinToggle={() =>
                    setPinnedChunkId(prev => (prev === chunk.id ? null : chunk.id))
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
          disabled={currentSentenceIndex === 0}
          className="h-12 w-12 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ChevronLeft className="h-6 w-6" />
          <span className="sr-only">Previous sentence</span>
        </Button>

        <span className="text-sm font-sans text-muted-foreground tabular-nums">
          {currentSentenceIndex + 1} of {totalSentences}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          disabled={currentSentenceIndex === totalSentences - 1}
          className="h-12 w-12 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ChevronRight className="h-6 w-6" />
          <span className="sr-only">Next sentence</span>
        </Button>
      </div>

      {totalSentences > 1 && (
        <MobileReadingEdgeTurn
          enabled
          canGoPrevious={currentSentenceIndex > 0}
          canGoNext={currentSentenceIndex < totalSentences - 1}
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
