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
    const rect = chunkRef.current.getBoundingClientRect()
    const padding = 16
    const vw = window.innerWidth
    const tooltipWidth = POPUP_WIDTH
    const gap = GAP_FROM_WORD[variant]
    const edgeClearance = 16 + gap

    const wordCenterX = rect.left + rect.width * 0.48

    let tooltipLeft = wordCenterX - tooltipWidth / 2
    tooltipLeft = Math.max(padding, Math.min(tooltipLeft, vw - padding - tooltipWidth))

    const rawArrowCenter = wordCenterX - tooltipLeft
    const arrowCenterX = Math.max(
      ARROW_EDGE_INSET,
      Math.min(tooltipWidth - ARROW_EDGE_INSET, rawArrowCenter),
    )

    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const placement =
      spaceAbove < POPUP_EST_HEIGHT + edgeClearance && spaceBelow >= POPUP_EST_HEIGHT + edgeClearance
        ? "below"
        : "above"

    setCoords({
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
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
      if (!onPinToggle) return
      const now = Date.now()
      if (lastTapRef.current && now - lastTapRef.current.t < 420) {
        onPinToggle()
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
    [onPinToggle],
  )

  const gap = GAP_FROM_WORD[variant]
  const arrowSize = ARROW_BOX[variant]
  const stemLen = variant === "article" ? 20 : 0

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
        padding: "12px 14px",
        overflow: "visible",
      }}
    >
      {/* Article: thin stem from card toward the word so the tooltip sits clearly above/below the finger */}
      {stemLen > 0 && coords.placement === "above" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: coords.arrowCenterX,
            transform: "translateX(-50%)",
            top: "100%",
            width: 2,
            height: stemLen,
            marginTop: -1,
            borderRadius: 1,
            background: "linear-gradient(to bottom, rgba(201,122,90,0.4), rgba(201,122,90,0.22))",
          }}
        />
      )}
      {stemLen > 0 && coords.placement === "below" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: coords.arrowCenterX,
            transform: "translateX(-50%)",
            bottom: "100%",
            width: 2,
            height: stemLen,
            marginBottom: -1,
            borderRadius: 1,
            background: "linear-gradient(to top, rgba(201,122,90,0.4), rgba(201,122,90,0.22))",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          width: arrowSize,
          height: arrowSize,
          left: coords.arrowCenterX,
          backgroundColor: "#f4efe9",
          borderLeft: "1px solid rgba(201,122,90,0.28)",
          borderTop: "1px solid rgba(201,122,90,0.28)",
          transform: coords.placement === "above"
            ? "translateX(-50%) translateY(50%) rotate(45deg)"
            : "translateX(-50%) translateY(-50%) rotate(45deg)",
          ...(coords.placement === "above"
            ? {
                bottom: stemLen,
                borderLeft: "none",
                borderTop: "none",
                borderRight: "1px solid rgba(201,122,90,0.28)",
                borderBottom: "1px solid rgba(201,122,90,0.28)",
              }
            : {
                top: stemLen,
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
        onClick={onActivate}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={(e) => {
          e.preventDefault()
          onPinToggle?.()
        }}
        className={cn(
          "cursor-pointer transition-all duration-200 ease-in-out rounded-sm px-0.5 -mx-0.5",
          /* Touch/hover: underline. Double-tap/click pin: terracotta highlight on top of that. */
          isPinned
            ? "underline underline-offset-2 decoration-[1.5px] bg-primary/10 text-foreground decoration-[#c97a5a]/75"
            : isTouchHighlight
              ? "underline underline-offset-2 decoration-[1.5px] text-foreground decoration-[#c97a5a]/60"
              : "decoration-transparent",
        )}
      >
        {chunk.text}
      </span>

      {typeof document !== "undefined" && popup && createPortal(popup, document.body)}
    </span>
  )
}
