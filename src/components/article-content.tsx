"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { TextChunk } from "./text-chunk"
import { gapBetweenReconciledChunks, type ReconciledItem } from "@/lib/translate"
import { useChunkTouchExploration } from "@/hooks/use-chunk-touch-exploration"
import { cn } from "@/lib/utils"

interface ArticleContentProps {
  items: ReconciledItem[]
}

export function ArticleContent({ items }: ArticleContentProps) {
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(setExploringChunkId, [items])

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

  let chunkId = 0
  return (
    <div
      className="w-full mx-auto px-6 md:px-8 md:pt-24 max-md:pt-[calc(env(safe-area-inset-top,0px)+7.75rem)] pb-16"
      style={{ maxWidth: "700px" }}
    >
      <article
        ref={touchSurfaceRef}
        className={cn(
          "font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground selection:bg-primary/20",
          touchExploring && "touch-none select-none",
        )}
      >
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
              />
            </span>
          )
        })}
      </article>
    </div>
  )
}
