"use client"

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type MouseEvent,
  type RefObject,
  type TransitionEvent,
  type TouchEvent,
} from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface ChunkData {
  /** Stable chunk id when provided (read/article); used for tooltip content keys */
  id?: number
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
  /**
   * Read / article: parent runs line-rect hit testing on the surface — skip per-span
   * mouseenter/leave so overlapping inline boxes and portaled tooltips don’t mis-target hover.
   */
  delegatePointerHover?: boolean
  /**
   * When `delegatePointerHover` is set, parent passes viewport coords so the tooltip arrow
   * tracks the pointer while the popup is open.
   */
  followPointerClient?: { x: number; y: number } | null
  /**
   * Mobile thumb-drag: skip position transitions so rapid updates don’t fight CSS interpolation.
   */
  followPointerSnap?: boolean
  /**
   * Touch drag: read coords from this ref each frame (no parent setState) — avoids re-rendering every chunk.
   */
  followPointerRef?: RefObject<{ x: number; y: number } | null>
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

const POPUP_WIDTH = 250
const POPUP_EST_HEIGHT = 120
/** Hover meaning card — quick fade out (ms) */
const TOOLTIP_FADE_OUT_MS = 0
/** Tooltip box + arrow ease horizontally toward the pointer (ms) */
const TOOLTIP_FOLLOW_POSITION_MS = 45
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

/**
 * Line box that contains the pointer (wrapped chunks), else the line closest vertically to `clientY`.
 */
function lineRectForPointer(el: HTMLElement, clientX: number, clientY: number): { union: DOMRect; anchorLine: DOMRect } {
  const base = getChunkLineRects(el)
  const list = el.getClientRects()
  let best: DOMRect | null = null
  let bestDist = Infinity
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (r.width <= 0 && r.height <= 0) continue
    if (clientY >= r.top && clientY <= r.bottom && clientX >= r.left && clientX <= r.right) {
      return { union: base.union, anchorLine: r }
    }
    const midY = (r.top + r.bottom) / 2
    const d = Math.abs(clientY - midY)
    if (d < bestDist) {
      bestDist = d
      best = r
    }
  }
  return { union: base.union, anchorLine: best ?? base.anchorLine }
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
  delegatePointerHover = false,
  followPointerClient = null,
  followPointerSnap = false,
  followPointerRef,
}: TextChunkProps) {
  if (isPunctuationOnly(chunk.text)) {
    return <span>{chunk.text.trim()}</span>
  }

  const isPopupOpen = popupChunkId === chunk.id
  const [coords, setCoords] = useState<PopupCoords | null>(null)
  const chunkRef = useRef<HTMLSpanElement>(null)
  /** transitionend must not clear coords if user re-hovered before fade finished */
  const isPopupOpenRef = useRef(isPopupOpen)
  isPopupOpenRef.current = isPopupOpen
  const lastTapRef = useRef<{ t: number } | null>(null)
  const tapResetTimerRef = useRef<number | null>(null)
  /** Last viewport pointer while this chunk’s tooltip is open — reflow scroll/resize */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerRafRef = useRef<number | null>(null)
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null)

  const placeTooltip = useCallback(
    (pointerX?: number | null, pointerY?: number | null) => {
      if (!chunkRef.current) return
      const el = chunkRef.current
      const usePointer = pointerX != null && pointerY != null
      if (usePointer) {
        lastPointerRef.current = { x: pointerX, y: pointerY }
      }

      const { union, anchorLine } = usePointer
        ? lineRectForPointer(el, pointerX, pointerY)
        : getChunkLineRects(el)

      const padding = 16
      const vw = window.innerWidth
      const tooltipWidth = POPUP_WIDTH
      const gap = GAP_FROM_WORD[variant]
      const edgeClearance = 16 + gap

      const anchorX = usePointer
        ? Math.max(anchorLine.left, Math.min(anchorLine.right, pointerX))
        : anchorLine.left + anchorLine.width * 0.48

      let tooltipLeft = anchorX - tooltipWidth / 2
      tooltipLeft = Math.max(padding, Math.min(tooltipLeft, vw - padding - tooltipWidth))

      const rawArrowCenter = anchorX - tooltipLeft
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

      const next: PopupCoords = {
        anchorTop: anchorLine.top,
        anchorBottom: anchorLine.bottom,
        tooltipLeft,
        arrowCenterX,
        placement,
      }
      setCoords((prev) => {
        if (
          prev &&
          prev.placement === next.placement &&
          prev.tooltipLeft === next.tooltipLeft &&
          prev.anchorTop === next.anchorTop &&
          prev.anchorBottom === next.anchorBottom &&
          prev.arrowCenterX === next.arrowCenterX
        ) {
          return prev
        }
        return next
      })
    },
    [variant],
  )

  const flushPendingPointer = useCallback(() => {
    pointerRafRef.current = null
    const p = pointerPendingRef.current
    if (!p) return
    placeTooltip(p.x, p.y)
  }, [placeTooltip])

  const schedulePlaceFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      pointerPendingRef.current = { x: clientX, y: clientY }
      if (pointerRafRef.current != null) return
      pointerRafRef.current = requestAnimationFrame(flushPendingPointer)
    },
    [flushPendingPointer],
  )

  useLayoutEffect(() => {
    if (!isPopupOpen) {
      lastPointerRef.current = null
      pointerPendingRef.current = null
      if (pointerRafRef.current != null) {
        cancelAnimationFrame(pointerRafRef.current)
        pointerRafRef.current = null
      }
      return
    }
    if (delegatePointerHover && followPointerClient) {
      placeTooltip(followPointerClient.x, followPointerClient.y)
    } else if (delegatePointerHover && followPointerRef) {
      const p = followPointerRef.current
      if (p) placeTooltip(p.x, p.y)
      else placeTooltip(null, null)
    } else if (!delegatePointerHover) {
      const p = lastPointerRef.current
      placeTooltip(p?.x ?? null, p?.y ?? null)
    } else {
      placeTooltip(null, null)
    }
  }, [
    isPopupOpen,
    delegatePointerHover,
    followPointerClient,
    followPointerRef,
    placeTooltip,
  ])

  useLayoutEffect(() => {
    if (!isPopupOpen || !delegatePointerHover || !followPointerRef) return
    let alive = true
    let rafId = 0
    const step = () => {
      if (!alive) return
      const p = followPointerRef.current
      if (p) placeTooltip(p.x, p.y)
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => {
      alive = false
      cancelAnimationFrame(rafId)
    }
  }, [isPopupOpen, delegatePointerHover, followPointerRef, placeTooltip])

  useEffect(() => {
    if (!isPopupOpen) return
    const onReflow = () => {
      const p = lastPointerRef.current
      placeTooltip(p?.x ?? null, p?.y ?? null)
    }
    window.addEventListener("scroll", onReflow, { passive: true })
    window.addEventListener("resize", onReflow)
    return () => {
      window.removeEventListener("scroll", onReflow)
      window.removeEventListener("resize", onReflow)
    }
  }, [isPopupOpen, placeTooltip])

  useEffect(() => {
    return () => {
      if (tapResetTimerRef.current != null) window.clearTimeout(tapResetTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pointerRafRef.current != null) cancelAnimationFrame(pointerRafRef.current)
    }
  }, [])

  const handleChunkMouseMove = useCallback(
    (e: MouseEvent<HTMLSpanElement>) => {
      if (!isPopupOpen || delegatePointerHover) return
      schedulePlaceFromPointer(e.clientX, e.clientY)
    },
    [isPopupOpen, delegatePointerHover, schedulePlaceFromPointer],
  )

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
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

  const showTooltip = coords !== null
  const followMotionMs =
    isPopupOpen && followPointerSnap ? 0 : TOOLTIP_FOLLOW_POSITION_MS

  const handleTooltipTransitionEnd = useCallback((e: TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== "opacity" || e.target !== e.currentTarget) return
    if (!isPopupOpenRef.current) {
      setCoords(null)
    }
  }, [])

  const popup = showTooltip && coords && (
    <div
      data-popup
      onTransitionEnd={handleTooltipTransitionEnd}
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
        /* Portaled above text — pass pointer through so hit-testing stays on the article/read surface */
        pointerEvents: "none",
        opacity: isPopupOpen ? 1 : 0,
        transition: isPopupOpen
          ? `left ${followMotionMs}ms linear, top ${followMotionMs}ms linear, opacity 0ms`
          : `opacity ${TOOLTIP_FADE_OUT_MS}ms ease-out`,
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
          transition: isPopupOpen ? `left ${followMotionMs}ms linear` : undefined,
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

      <div
        className="chunk-tooltip-body"
        key={chunk.id != null ? `c${chunk.id}-${chunk.meaning}` : `${chunk.text}-${chunk.meaning}`}
      >
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
        onMouseEnter={delegatePointerHover ? undefined : onActivate}
        onMouseLeave={delegatePointerHover ? undefined : onDeactivate}
        onMouseMove={delegatePointerHover ? undefined : handleChunkMouseMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={(e) => {
          e.preventDefault()
          onPinToggle?.()
        }}
        className={cn(
          /* Keep underline in the tree so decoration-color can fade (snap-off feels harsh) */
          "cursor-pointer rounded-sm px-0.5 -mx-0.5 underline underline-offset-2 decoration-[3px]",
          "transition-[text-decoration-color,background-color] duration-700 ease-out md:duration-500",
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
