"use client"

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react"
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

function getChunkIdFromPoint(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  if (!el) return null
  const hit = el.closest("[data-chunk-id]") as HTMLElement | null
  if (!hit) return null
  const raw = hit.getAttribute("data-chunk-id")
  if (raw == null) return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

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
  const [activeChunkId, setActiveChunkId] = useState<number | null>(null)
  const [touchExploring, setTouchExploring] = useState(false)

  const touchSurfaceRef = useRef<HTMLDivElement>(null)
  const touchExploringRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null)
  const lastEmittedIdRef = useRef<number | null>(null)
  const suppressNextClickRef = useRef(false)

  const currentSentence = { chunks: pages[currentSentenceIndex] ?? [] }
  const totalSentences = pages.length

  useEffect(() => {
    if (touchExploring) {
      document.body.classList.add("read-mode-touch-exploring")
      document.documentElement.style.overflow = "hidden"
    } else {
      document.body.classList.remove("read-mode-touch-exploring")
      document.documentElement.style.overflow = ""
    }
    return () => {
      document.body.classList.remove("read-mode-touch-exploring")
      document.documentElement.style.overflow = ""
    }
  }, [touchExploring])

  const handleGlobalClick = useCallback((e: MouseEvent) => {
    if (suppressNextClickRef.current) return
    const target = e.target as HTMLElement
    if (!target.closest("[data-chunk]") && !target.closest("[data-popup]")) {
      setActiveChunkId(null)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  useLayoutEffect(() => {
    const el = touchSurfaceRef.current
    if (!el) return

    const runHitTest = () => {
      const p = pendingPointRef.current
      if (!p || !touchExploringRef.current) return
      const id = getChunkIdFromPoint(p.x, p.y)
      if (id === null) return
      if (lastEmittedIdRef.current === id) return
      lastEmittedIdRef.current = id
      setActiveChunkId(id)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const id = getChunkIdFromPoint(t.clientX, t.clientY)
      if (id === null) return

      touchExploringRef.current = true
      setTouchExploring(true)
      lastEmittedIdRef.current = id
      setActiveChunkId(id)
      pendingPointRef.current = { x: t.clientX, y: t.clientY }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!touchExploringRef.current || e.touches.length !== 1) return
      e.preventDefault()
      const t = e.touches[0]
      pendingPointRef.current = { x: t.clientX, y: t.clientY }

      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        runHitTest()
      })
    }

    const endTouchExploration = () => {
      if (!touchExploringRef.current) return
      touchExploringRef.current = false
      setTouchExploring(false)
      lastEmittedIdRef.current = null
      setActiveChunkId(null)
      pendingPointRef.current = null
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      suppressNextClickRef.current = true
      window.setTimeout(() => {
        suppressNextClickRef.current = false
      }, 450)
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", endTouchExploration)
    el.addEventListener("touchcancel", endTouchExploration)

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", endTouchExploration)
      el.removeEventListener("touchcancel", endTouchExploration)
      touchExploringRef.current = false
      setTouchExploring(false)
      document.body.classList.remove("read-mode-touch-exploring")
      document.documentElement.style.overflow = ""
    }
  }, [currentSentenceIndex])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        if (currentSentenceIndex > 0) {
          setCurrentSentenceIndex(prev => prev - 1)
          setActiveChunkId(null)
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        if (currentSentenceIndex < totalSentences - 1) {
          setCurrentSentenceIndex(prev => prev + 1)
          setActiveChunkId(null)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
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
      <div className="flex-1 flex items-center justify-center w-full pt-16" style={{ maxWidth: "700px" }}>
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
                  isActive={activeChunkId === chunk.id}
                  onActivate={() => setActiveChunkId(chunk.id)}
                  onDeactivate={() => setActiveChunkId(null)}
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
