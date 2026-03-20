"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { TextChunk } from "./text-chunk"
import { useChunkTouchExploration } from "@/hooks/use-chunk-touch-exploration"
import { cn } from "@/lib/utils"

interface ChunkData {
  id: number
  text: string
  meaning: string
  literal?: string
  grammar?: string
}

interface ArticleModeProps {
  chunks: ChunkData[]
}

export function ArticleMode({ chunks }: ArticleModeProps) {
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(setExploringChunkId, [chunks])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  const handleGlobalClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest("[data-chunk]") && !target.closest("[data-popup]")) {
      setExploringChunkId(null)
      setPinnedChunkId(null)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  return (
    <div
      className="w-full mx-auto px-6 md:px-8 md:pt-24 max-md:pt-[calc(env(safe-area-inset-top,0px)+6rem)] pb-16"
      style={{ maxWidth: "700px" }}
    >
      <article
        ref={touchSurfaceRef}
        className={cn(
          "font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground selection:bg-primary/20",
          touchExploring && "touch-none select-none",
        )}
      >
        {chunks.map((chunk, index) => (
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
              onPinToggle={() => setPinnedChunkId(prev => (prev === chunk.id ? null : chunk.id))}
            />
            {index < chunks.length - 1 && " "}
          </span>
        ))}
      </article>
    </div>
  )
}
