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
    const spaceBelow = window.innerHeight - rect.bottom
    const popupHeight = 130
    const popupWidth = 288 // w-72 = 18rem = 288px

    // Prefer above; only fall back to below if the popup would clip off the viewport top
    if (spaceAbove < popupHeight + 16 && spaceBelow >= popupHeight + 16) {
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
          "underline underline-offset-2 decoration-[1.5px]",
          isActive
            ? "bg-primary/10 text-foreground decoration-[#9E5843]/70"
            : "decoration-transparent hover:bg-muted hover:decoration-[#C48A7A]/45"
        )}
      >
        {chunk.text}
      </span>
      
      {isActive && (
        <span
          ref={popupRef}
          data-popup
          className={cn(
            "absolute z-50 block w-64 md:w-72 p-3 rounded-md",
            "animate-in zoom-in-95 duration-150",
            popupPosition === "above"
              ? "bottom-full mb-2"
              : "top-full mt-2"
          )}
          style={{
            backgroundColor: "rgb(248, 245, 239)",
            opacity: 1,
            border: "1px solid rgba(158, 88, 67, 0.22)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            left: `calc(50% + ${popupOffset}px)`,
            transform: "translateX(-50%)",
          }}
          onMouseEnter={onActivate}
          onMouseLeave={onDeactivate}
        >
          {/* Arrow */}
          <span
            className={cn(
              "absolute block w-3 h-3 rotate-45",
              popupPosition === "above"
                ? "bottom-0 translate-y-1/2 border-r border-b"
                : "top-0 -translate-y-1/2 border-l border-t"
            )}
            style={{
              backgroundColor: "rgb(248, 245, 239)",
              borderColor: "rgba(158, 88, 67, 0.22)",
              left: `calc(50% - ${popupOffset}px)`,
              transform: `translateX(-50%) rotate(45deg) ${popupPosition === "above" ? "translateY(50%)" : "translateY(-50%)"}`
            }}
          />
          
          {/* Content — text colors hardcoded since bg is always light cream */}
          <span className="relative block">
            <span className="block text-lg font-serif font-medium leading-snug" style={{ color: "#2C1A10" }}>
              {chunk.meaning}
            </span>

            {(chunk.literal || chunk.grammar) && (
              <span className="block mt-2 pt-2" style={{ borderTop: "1px solid rgba(158, 88, 67, 0.12)" }}>
                {chunk.literal && (
                  <span className="block text-sm" style={{ color: "#4A3328" }}>
                    <span
                      className="font-sans uppercase tracking-[0.08em] text-[10px] mr-1"
                      style={{ color: "#bdb9b1" }}
                    >Literal</span>
                    <span className="mr-1" style={{ color: "#C48A7A", opacity: 0.45 }}>·</span>
                    {chunk.literal}
                  </span>
                )}
                {chunk.grammar && (
                  <span className={`block text-sm italic ${chunk.literal ? "mt-1.5" : ""}`} style={{ color: "#4A3328" }}>
                    <span
                      className="font-sans not-italic uppercase tracking-[0.08em] text-[10px] mr-1"
                      style={{ color: "#bdb9b1" }}
                    >Note</span>
                    <span className="mr-1" style={{ color: "#C48A7A", opacity: 0.45 }}>·</span>
                    {chunk.grammar}
                  </span>
                )}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  )
}
