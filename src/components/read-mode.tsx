"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { TextChunk, shouldGlueAfterPriorChunk } from "./text-chunk"
import { Button } from "@/components/ui/button"
import { useChunkTouchExploration } from "@/hooks/use-chunk-touch-exploration"

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
  sentences: Sentence[]
}

const MAX_WORDS_PER_PAGE = 20

function buildPages(sentences: Sentence[]): ChunkData[][] {
  const pages: ChunkData[][] = []
  let current: ChunkData[] = []
  let wordCount = 0

  for (const sentence of sentences) {
    for (const chunk of sentence.chunks) {
      const words = chunk.text.trim().split(/\s+/).filter(w => /\w/.test(w)).length

      if (wordCount + words > MAX_WORDS_PER_PAGE && current.length > 0) {
        pages.push(current)
        current = []
        wordCount = 0
      }

      current.push(chunk)
      wordCount += words
    }
  }

  if (current.length > 0) pages.push(current)
  return pages
}

export function ReadMode({ sentences }: ReadModeProps) {
  const pages = buildPages(sentences)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(setExploringChunkId, [
    currentSentenceIndex,
  ])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  const currentSentence = { chunks: pages[currentSentenceIndex] ?? [] }
  const totalSentences = pages.length

  const clearChunkUi = useCallback(() => {
    setExploringChunkId(null)
    setPinnedChunkId(null)
  }, [])

  const handleGlobalClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-chunk]") && !target.closest("[data-popup]")) {
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

  const goToPrevious = () => {
    if (currentSentenceIndex > 0) {
      setCurrentSentenceIndex(currentSentenceIndex - 1)
      clearChunkUi()
    }
  }

  const goToNext = () => {
    if (currentSentenceIndex < totalSentences - 1) {
      setCurrentSentenceIndex(currentSentenceIndex + 1)
      clearChunkUi()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-5rem)] max-md:min-h-0 max-md:flex-1 px-6 md:px-8">
      <div
        className="flex-1 flex items-center justify-center w-full md:pt-16 max-md:pt-[max(5rem,calc(env(safe-area-inset-top,0px)+3.75rem))]"
        style={{ maxWidth: "700px" }}
      >
        <div
          ref={touchSurfaceRef}
          className={`block w-full font-serif text-3xl md:text-5xl lg:text-6xl leading-snug md:leading-tight text-center text-foreground text-balance selection:bg-primary/20 ${
            touchExploring ? "touch-none select-none" : ""
          }`}
        >
          {currentSentence.chunks.map((chunk, index) => {
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
                />
                {gapAfter}
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-8 pb-12 pt-8">
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
    </div>
  )
}
