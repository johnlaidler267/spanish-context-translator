"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
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

interface PopupCoords {
  anchorTop: number
  anchorBottom: number
  /** Viewport X: left edge of the tooltip box */
  tooltipLeft: number
  /** Tooltip-local X: horizontal center of the arrow (points at word center) */
  arrowCenterX: number
  placement: "above" | "below"
}

const POPUP_WIDTH = 288
const POPUP_EST_HEIGHT = 120
/** Keep arrow diamond inside tooltip; min distance from edge to arrow center (px) */
const ARROW_EDGE_INSET = 12

/** True if chunk is only punctuation/symbols — should sit flush after the previous word in read mode */
export function isPunctuationOnly(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /^[^\w\u00C0-\u024F]+$/.test(t)
}

/** Punctuation-only chunks that still need a normal space from the previous token (e.g. ". ¿Cómo…") */
const OPENING_PUNCT_RE = /^[¿¡(«"“‘\u201C\u2018]/

/** If true, read mode should not insert a gap before this chunk (fixes "word ," → "word,") */
export function shouldGlueAfterPriorChunk(nextChunkText: string): boolean {
  if (!isPunctuationOnly(nextChunkText)) return false
  const t = nextChunkText.trim()
  if (OPENING_PUNCT_RE.test(t)) return false
  return true
}

export function TextChunk({ chunk, isActive, onActivate, onDeactivate }: TextChunkProps) {
  if (isPunctuationOnly(chunk.text)) {
    return <span>{chunk.text}</span>
  }
  const [coords, setCoords] = useState<PopupCoords | null>(null)
  const chunkRef = useRef<HTMLSpanElement>(null)

  const calculateCoords = useCallback(() => {
    if (!chunkRef.current) return
    const rect = chunkRef.current.getBoundingClientRect()
    const padding = 16
    const vw = window.innerWidth
    const tooltipWidth = POPUP_WIDTH

    // Pin: horizontal anchor on the word (slight left bias reads natural on small spans)
    const wordCenterX = rect.left + rect.width * 0.48

    // Bubble: shift horizontally to stay in viewport; not necessarily centered under word
    let tooltipLeft = wordCenterX - tooltipWidth / 2
    tooltipLeft = Math.max(padding, Math.min(tooltipLeft, vw - padding - tooltipWidth))

    // Arrow: stays under wordCenterX; clamp within tooltip so it doesn’t clip
    const rawArrowCenter = wordCenterX - tooltipLeft
    const arrowCenterX = Math.max(
      ARROW_EDGE_INSET,
      Math.min(tooltipWidth - ARROW_EDGE_INSET, rawArrowCenter),
    )

    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const placement =
      spaceAbove < POPUP_EST_HEIGHT + 16 && spaceBelow >= POPUP_EST_HEIGHT + 16 ? "below" : "above"

    setCoords({
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      tooltipLeft,
      arrowCenterX,
      placement,
    })
  }, [])

  useEffect(() => {
    if (isActive) calculateCoords()
    else setCoords(null)
  }, [isActive, calculateCoords])

  // Recompute on scroll/resize so popup tracks the word
  useEffect(() => {
    if (!isActive) return
    window.addEventListener("scroll", calculateCoords, { passive: true })
    window.addEventListener("resize", calculateCoords)
    return () => {
      window.removeEventListener("scroll", calculateCoords)
      window.removeEventListener("resize", calculateCoords)
    }
  }, [isActive, calculateCoords])

  const popup = coords && (
    <div
      data-popup
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      style={{
        position: "fixed",
        top:
          coords.placement === "above"
            ? coords.anchorTop - 10
            : coords.anchorBottom + 10,
        left: coords.tooltipLeft,
        width: POPUP_WIDTH,
        boxSizing: "border-box",
        transform: coords.placement === "above" ? "translateY(-100%)" : "none",
        zIndex: 9999,
        backgroundColor: "#f4efe9",
        border: "1px solid rgba(201, 122, 90, 0.28)",
        borderRadius: "4px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)",
        padding: "12px 14px",
      }}
    >
      {/* Arrow: horizontal position tracks word; bubble may shift — arrow stays pinned in tooltip-local X */}
      <div
        style={{
          position: "absolute",
          width: 10,
          height: 10,
          left: coords.arrowCenterX,
          backgroundColor: "#f4efe9",
          borderLeft: "1px solid rgba(201,122,90,0.28)",
          borderTop: "1px solid rgba(201,122,90,0.28)",
          transform: coords.placement === "above"
            ? "translateX(-50%) translateY(50%) rotate(45deg)"
            : "translateX(-50%) translateY(-50%) rotate(45deg)",
          ...(coords.placement === "above"
            ? { bottom: 0, borderLeft: "none", borderTop: "none", borderRight: "1px solid rgba(201,122,90,0.28)", borderBottom: "1px solid rgba(201,122,90,0.28)" }
            : { top: 0, borderRight: "none", borderBottom: "none", borderLeft: "1px solid rgba(201,122,90,0.28)", borderTop: "1px solid rgba(201,122,90,0.28)" }),
        }}
      />

      {/* Meaning */}
      <p style={{ fontSize: "1.05rem", fontFamily: "var(--font-serif)", fontWeight: 600, color: "#3a332e", lineHeight: 1.3, margin: 0 }}>
        {chunk.meaning}
      </p>

      {(chunk.literal || chunk.grammar) && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(201,122,90,0.16)" }}>
          {chunk.literal && (
            <p style={{ margin: "0 0 4px", fontSize: "0.8rem", color: "#454039" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a8278" }}>Literal</span>
              <span style={{ margin: "0 5px", color: "#c97a5a", opacity: 0.55 }}>·</span>
              {chunk.literal}
            </p>
          )}
          {chunk.grammar && (
            <p style={{ margin: 0, fontSize: "0.8rem", fontStyle: "italic", color: "#454039" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontStyle: "normal", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a8278" }}>Note</span>
              <span style={{ margin: "0 5px", color: "#c97a5a", opacity: 0.55 }}>·</span>
              {chunk.grammar}
            </p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <span style={{ position: "relative", display: "inline" }}>
      <span
        ref={chunkRef}
        data-chunk
        data-chunk-id={chunk.id}
        onClick={onActivate}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        className={cn(
          "cursor-pointer transition-all duration-200 ease-in-out rounded-sm px-0.5 -mx-0.5",
          "underline underline-offset-2 decoration-[1.5px]",
          isActive
            ? "bg-primary/10 text-foreground decoration-[#c97a5a]/75"
            : "decoration-transparent hover:bg-muted hover:decoration-[#c97a5a]/45"
        )}
      >
        {chunk.text}
      </span>

      {typeof document !== "undefined" && popup && createPortal(popup, document.body)}
    </span>
  )
}
