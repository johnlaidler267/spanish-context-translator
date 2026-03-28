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
  /** Which chunk shows the popup (finger exploration wins over pinned) */
  popupChunkId: number | null
  /** Active chunk (tap/hover) — underline */
  isTouchHighlight: boolean
  /** Double-tap / double-click pin — terracotta highlight + tooltip stays after lift */
  isPinned: boolean
  onActivate: () => void
  onDeactivate: () => void
  /** Pin / unpin on double-tap (touch) or double-click (desktop) */
  onPinToggle?: () => void
  /**
   * Called on single-click (desktop) or double-tap (mobile) to open the
   * bottom details box for this chunk.
   */
  onRequestDetails?: () => void
  /**
   * Article body text is smaller — use a longer gap + stem so the tooltip clears the finger.
   * Read mode keeps a compact callout.
   */
  variant?: "article" | "read"
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

/** Vertical gap from word to tooltip (article: farther so finger doesn’t cover the card) */
const GAP_FROM_WORD: Record<"article" | "read", number> = { read: 10, article: 36 }
/** Diamond “arrow” size (px); article uses a larger tip + gap so the callout clears the finger */
const ARROW_BOX: Record<"article" | "read", number> = { read: 10, article: 15 }

/**
 * Inline wrapped chunks: union bounding box top = first line, but the reader is often on the last line.
 * Returns full union for placement math, and the last non-empty line box for anchor + arrow X.
 */
function getChunkLineRects(el: HTMLElement): { union: DOMRect; anchorLine: DOMRect } {
  const list = el.getClientRects()
  if (list.length === 0) {
    const r = el.getBoundingClientRect()
    return { union: r, anchorLine: r }
  }
  let minL = Infinity
  let minT = Infinity
  let maxR = -Infinity
  let maxB = -Infinity
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (r.width <= 0 && r.height <= 0) continue
    minL = Math.min(minL, r.left)
    minT = Math.min(minT, r.top)
    maxR = Math.max(maxR, r.right)
    maxB = Math.max(maxB, r.bottom)
  }
  if (minL === Infinity) {
    const r = el.getBoundingClientRect()
    return { union: r, anchorLine: r }
  }
  const union = new DOMRect(minL, minT, maxR - minL, maxB - minT)
  let anchorLine = list[list.length - 1]
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]
    if (r.width > 0 || r.height > 0) {
      anchorLine = r
      break
    }
  }
  return { union, anchorLine }
}

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

export function TextChunk({
  chunk,
  popupChunkId,
  isTouchHighlight,
  isPinned,
  onActivate,
  onDeactivate,
  onPinToggle,
  onRequestDetails,
  variant = "read",
}: TextChunkProps) {
  if (isPunctuationOnly(chunk.text)) {
    return <span>{chunk.text}</span>
  }

  const isPopupOpen = popupChunkId === chunk.id
  const [coords, setCoords] = useState<PopupCoords | null>(null)
  const chunkRef = useRef<HTMLSpanElement>(null)
  const lastTapRef = useRef<{ t: number } | null>(null)
  const tapResetTimerRef = useRef<number | null>(null)

  const calculateCoords = useCallback(() => {
    if (!chunkRef.current) return
    const { union, anchorLine } = getChunkLineRects(chunkRef.current)
    const padding = 16
    const vw = window.innerWidth
    const tooltipWidth = POPUP_WIDTH
    const gap = GAP_FROM_WORD[variant]
    const edgeClearance = 16 + gap

    const wordCenterX = anchorLine.left + anchorLine.width * 0.48

    let tooltipLeft = wordCenterX - tooltipWidth / 2
    tooltipLeft = Math.max(padding, Math.min(tooltipLeft, vw - padding - tooltipWidth))

    const rawArrowCenter = wordCenterX - tooltipLeft
    const arrowCenterX = Math.max(
      ARROW_EDGE_INSET,
      Math.min(tooltipWidth - ARROW_EDGE_INSET, rawArrowCenter),
    )

    const spaceAbove = union.top
    const spaceBelow = window.innerHeight - union.bottom
    const placement =
      spaceAbove < POPUP_EST_HEIGHT + edgeClearance && spaceBelow >= POPUP_EST_HEIGHT + edgeClearance
        ? "below"
        : "above"

    setCoords({
      anchorTop: anchorLine.top,
      anchorBottom: anchorLine.bottom,
      tooltipLeft,
      arrowCenterX,
      placement,
    })
  }, [variant])

  useEffect(() => {
    if (isPopupOpen) calculateCoords()
    else setCoords(null)
  }, [isPopupOpen, calculateCoords])

  useEffect(() => {
    if (!isPopupOpen) return
    window.addEventListener("scroll", calculateCoords, { passive: true })
    window.addEventListener("resize", calculateCoords)
    return () => {
      window.removeEventListener("scroll", calculateCoords)
      window.removeEventListener("resize", calculateCoords)
    }
  }, [isPopupOpen, calculateCoords])

  useEffect(() => {
    return () => {
      if (tapResetTimerRef.current != null) window.clearTimeout(tapResetTimerRef.current)
    }
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (lastTapRef.current && now - lastTapRef.current.t < 420) {
        // Double-tap: pin the popup AND open the details box
        onPinToggle?.()
        onRequestDetails?.()
        lastTapRef.current = null
        if (tapResetTimerRef.current != null) {
          window.clearTimeout(tapResetTimerRef.current)
          tapResetTimerRef.current = null
        }
      } else {
        lastTapRef.current = { t: now }
        if (tapResetTimerRef.current != null) window.clearTimeout(tapResetTimerRef.current)
        tapResetTimerRef.current = window.setTimeout(() => {
          lastTapRef.current = null
          tapResetTimerRef.current = null
        }, 450)
      }
    },
    [onPinToggle, onRequestDetails],
  )

  const gap = GAP_FROM_WORD[variant]
  const arrowSize = ARROW_BOX[variant]

  /**
   * Inner padding so the title/body never sit under the rotated diamond (half sits inside the card).
   * Finger clearance vs the word uses `gap` only — no separate stem (stem + % positioning broke on “below”).
   */
  const tailInset = arrowSize + 10
  const pad = 12
  const padX = 14

  const popup = coords && (
    <div
      data-popup
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      style={{
        position: "fixed",
        top:
          coords.placement === "above"
            ? coords.anchorTop - gap
            : coords.anchorBottom + gap,
        left: coords.tooltipLeft,
        width: POPUP_WIDTH,
        boxSizing: "border-box",
        transform: coords.placement === "above" ? "translateY(-100%)" : "none",
        zIndex: 9999,
        backgroundColor: "#f4efe9",
        border: "1px solid rgba(201, 122, 90, 0.28)",
        borderRadius: "4px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)",
        padding:
          coords.placement === "below"
            ? `${pad + tailInset}px ${padX}px ${pad}px ${padX}px`
            : `${pad}px ${padX}px ${pad + tailInset}px ${padX}px`,
        overflow: "visible",
      }}
    >
      {/* Single diamond straddling the card edge — center on border so it meets the gap to the word cleanly */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: arrowSize,
          height: arrowSize,
          left: coords.arrowCenterX,
          zIndex: 2,
          backgroundColor: "#f4efe9",
          borderLeft: "1px solid rgba(201,122,90,0.28)",
          borderTop: "1px solid rgba(201,122,90,0.28)",
          transform:
            coords.placement === "above"
              ? "translateX(-50%) translateY(50%) rotate(45deg)"
              : "translateX(-50%) translateY(-50%) rotate(45deg)",
          ...(coords.placement === "above"
            ? {
                bottom: 0,
                borderLeft: "none",
                borderTop: "none",
                borderRight: "1px solid rgba(201,122,90,0.28)",
                borderBottom: "1px solid rgba(201,122,90,0.28)",
              }
            : {
                top: 0,
                borderRight: "none",
                borderBottom: "none",
                borderLeft: "1px solid rgba(201,122,90,0.28)",
                borderTop: "1px solid rgba(201,122,90,0.28)",
              }),
        }}
      />

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
        onClick={() => {
          onActivate()
          onRequestDetails?.()
        }}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={(e) => {
          e.preventDefault()
          onPinToggle?.()
        }}
        className={cn(
          /* Keep underline in the tree so decoration-color can fade (snap-off feels harsh) */
          "cursor-pointer rounded-sm px-0.5 -mx-0.5 underline underline-offset-2 decoration-[1.5px]",
          "transition-[text-decoration-color,background-color] duration-700 ease-out md:duration-300",
          isPinned
            ? "bg-primary/10 text-foreground decoration-[#c97a5a]/75"
            : isTouchHighlight
              ? "text-foreground decoration-[#c97a5a]/60 bg-transparent"
              : "text-foreground decoration-transparent",
        )}
      >
        {chunk.text}
      </span>

      {typeof document !== "undefined" && popup && createPortal(popup, document.body)}
    </span>
  )
}
