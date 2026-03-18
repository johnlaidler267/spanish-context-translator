"use client"

import { useState, useEffect, useCallback } from "react"
import { TextChunk } from "./text-chunk"
import type { ReconciledItem } from "@/lib/translate"

interface ArticleContentProps {
  items: ReconciledItem[]
}

export function ArticleContent({ items }: ArticleContentProps) {
  const [activeChunkId, setActiveChunkId] = useState<number | null>(null)

  const handleGlobalClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest("[data-chunk]") && !target.closest("[data-popup]")) {
      setActiveChunkId(null)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  let chunkId = 0
  return (
    <div className="w-full mx-auto px-6 md:px-8 pt-24 pb-16" style={{ maxWidth: "700px" }}>
      <article className="font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground/90 selection:bg-primary/20">
        {items.map((item, i) => {
          if (item.type === "text") {
            return <span key={i}>{item.text}</span>
          }
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
              <TextChunk
                chunk={chunkData}
                isActive={activeChunkId === id}
                onActivate={() => setActiveChunkId(id)}
                onDeactivate={() => setActiveChunkId(null)}
              />
            </span>
          )
        })}
      </article>
    </div>
  )
}
