"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { TextChunk, shouldGlueAfterPriorChunk } from "./text-chunk"
import { Button } from "@/components/ui/button"

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

      // If adding this chunk exceeds the limit and we already have content, flush
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
  const [activeChunkId, setActiveChunkId] = useState<number | null>(null)

  const currentSentence = { chunks: pages[currentSentenceIndex] ?? [] }
  const totalSentences = pages.length

  // Handle click outside to dismiss popup on mobile
  const handleGlobalClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-chunk]') && !target.closest('[data-popup]')) {
      setActiveChunkId(null)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleGlobalClick)
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [handleGlobalClick])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentSentenceIndex > 0) {
          setCurrentSentenceIndex(prev => prev - 1)
          setActiveChunkId(null)
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentSentenceIndex < totalSentences - 1) {
          setCurrentSentenceIndex(prev => prev + 1)
          setActiveChunkId(null)
        }
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentSentenceIndex, totalSentences])

  const goToPrevious = () => {
    if (currentSentenceIndex > 0) {
      setCurrentSentenceIndex(currentSentenceIndex - 1)
      setActiveChunkId(null)
    }
  }

  const goToNext = () => {
    if (currentSentenceIndex < totalSentences - 1) {
      setCurrentSentenceIndex(currentSentenceIndex + 1)
      setActiveChunkId(null)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 md:px-8">
      {/* Sentence display */}
      <div className="flex-1 flex items-center justify-center w-full pt-16" style={{ maxWidth: "700px" }}>
        <span className="block font-serif text-3xl md:text-5xl lg:text-6xl leading-snug md:leading-tight text-center text-foreground text-balance selection:bg-primary/20">
          {currentSentence.chunks.map((chunk, index) => {
            const next = currentSentence.chunks[index + 1]
            /* Avoid "word ,"; keep space before ¿ ( after . etc. */
            const gapAfter =
              next != null && !shouldGlueAfterPriorChunk(next.text) ? " " : ""
            return (
              <span key={chunk.id}>
                <TextChunk
                  chunk={chunk}
                  isActive={activeChunkId === chunk.id}
                  onActivate={() => setActiveChunkId(chunk.id)}
                  onDeactivate={() => setActiveChunkId(null)}
                />
                {gapAfter}
              </span>
            )
          })}
        </span>
      </div>

      {/* Navigation */}
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
