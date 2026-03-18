"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface ChunkData {
  text: string
  meaning: string
  literal?: string
  grammar?: string
}

interface TextChunkProps {
  chunk: ChunkData
  isActive: boolean
  onActivate: () => void
  onDeactivate: () => void
}

export function TextChunk({ chunk, isActive, onActivate, onDeactivate }: TextChunkProps) {
  const [popupPosition, setPopupPosition] = useState<"above" | "below">("above")
  const [popupOffset, setPopupOffset] = useState(0)
  const chunkRef = useRef<HTMLSpanElement>(null)
  const popupRef = useRef<HTMLSpanElement>(null)

  // Calculate popup position to avoid screen edge clipping
  const calculatePopupPosition = useCallback(() => {
    if (!chunkRef.current) return

    const rect = chunkRef.current.getBoundingClientRect()
    const spaceAbove = rect.top
    const popupHeight = 140
    const popupWidth = 288 // w-72 = 18rem = 288px
    
    // Vertical position
    if (spaceAbove < popupHeight + 20) {
      setPopupPosition("below")
    } else {
      setPopupPosition("above")
    }
    
    // Horizontal offset to prevent edge clipping
    const chunkCenter = rect.left + rect.width / 2
    const viewportWidth = window.innerWidth
    const halfPopup = popupWidth / 2
    const padding = 16
    
    if (chunkCenter - halfPopup < padding) {
      // Too close to left edge
      setPopupOffset(halfPopup - chunkCenter + padding)
    } else if (chunkCenter + halfPopup > viewportWidth - padding) {
      // Too close to right edge
      setPopupOffset(viewportWidth - padding - chunkCenter - halfPopup)
    } else {
      setPopupOffset(0)
    }
  }, [])

  useEffect(() => {
    if (isActive) {
      calculatePopupPosition()
    }
  }, [isActive, calculatePopupPosition])

  return (
    <span className="relative inline">
      <span
        ref={chunkRef}
        data-chunk
        onClick={onActivate}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        className={cn(
          "cursor-pointer transition-all duration-200 rounded-sm px-0.5 -mx-0.5",
          "underline underline-offset-2 decoration-2",
          isActive 
            ? "bg-primary/15 text-foreground decoration-primary" 
            : "decoration-transparent hover:bg-muted hover:decoration-muted-foreground/40"
        )}
      >
        {chunk.text}
      </span>
      
      {isActive && (
        <span
          ref={popupRef}
          data-popup
          className={cn(
            "absolute z-50 block w-64 md:w-72 p-4 bg-popover border border-border rounded-lg shadow-xl",
            "animate-in fade-in-0 zoom-in-95 duration-150",
            popupPosition === "above" 
              ? "bottom-full mb-2" 
              : "top-full mt-2"
          )}
          style={{
            left: `calc(50% + ${popupOffset}px)`,
            transform: 'translateX(-50%)'
          }}
          onMouseEnter={onActivate}
          onMouseLeave={onDeactivate}
        >
          {/* Arrow */}
          <span 
            className={cn(
              "absolute block w-3 h-3 bg-popover border-border rotate-45",
              popupPosition === "above" 
                ? "bottom-0 translate-y-1/2 border-r border-b" 
                : "top-0 -translate-y-1/2 border-l border-t"
            )}
            style={{
              left: `calc(50% - ${popupOffset}px)`,
              transform: `translateX(-50%) rotate(45deg) ${popupPosition === "above" ? "translateY(50%)" : "translateY(-50%)"}`
            }}
          />
          
          {/* Content */}
          <span className="relative block">
            <span className="block text-lg font-serif font-medium text-foreground leading-snug">
              {chunk.meaning}
            </span>
            {chunk.literal && (
              <span className="block mt-2 text-sm text-muted-foreground">
                <span className="font-medium">Literal:</span> {chunk.literal}
              </span>
            )}
            {chunk.grammar && (
              <span className="block mt-1.5 text-sm italic text-muted-foreground/80">
                {chunk.grammar}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  )
}
