"use client"

import { useState, useEffect, useCallback } from "react"
import { TextChunk } from "./text-chunk"

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
  const [activeChunkId, setActiveChunkId] = useState<number | null>(null)

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

  return (
    <div className="w-full mx-auto px-6 md:px-8 pt-24 pb-16" style={{ maxWidth: "700px" }}>
      <article className="font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground/90 selection:bg-primary/20">
        {chunks.map((chunk, index) => (
          <span key={chunk.id}>
            <TextChunk
              chunk={chunk}
              isActive={activeChunkId === chunk.id}
              onActivate={() => setActiveChunkId(chunk.id)}
              onDeactivate={() => setActiveChunkId(null)}
            />
            {index < chunks.length - 1 && " "}
          </span>
        ))}
      </article>
    </div>
  )
}
