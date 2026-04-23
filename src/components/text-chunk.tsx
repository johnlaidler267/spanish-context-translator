"use client"

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type MouseEvent,
  type MutableRefObject,
  type RefObject,
  type TransitionEvent,
  type TouchEvent,
} from "react"
import { createPortal } from "react-dom"
import { splitChunkTextForUnderline } from "@/lib/chunk-text"
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
  /** Triple-tap (touch) / double-click pin — terracotta highlight + tooltip stays after lift */
  isPinned: boolean
  onActivate: () => void
  onDeactivate: () => void
  /** Pin / unpin on triple-tap (touch) or double-click (desktop) */
  onPinToggle?: () => void
  /** Desktop double-click: keep details UI, hide translation tooltip for this chunk. */
  onDoubleClickMenuOnly?: () => void
  /**
   * Called on single-click (desktop) or triple-tap (mobile) to open the
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
   * Touch drag: latest viewport point without parent setState (initial layout + scroll reflow).
   */
  followPointerRef?: RefObject<{ x: number; y: number } | null>
  /**
   * Parent calls this from native touch handlers so placement runs in the same turn as touchmove
   * (desktop uses state → useLayoutEffect; rAF-only follow felt a frame late on phones).
   */
  followPointerPlaceRef?: MutableRefObject<((x: number, y: number) => void) | null>
  /**
   * Mobile delegated hover: first explore lift per chunk must not seed the tap chain; parent sets
   * this in capture before `touchend` reaches the span.
   */
  suppressDoubleTapAfterExplorationLiftRef?: MutableRefObject<number | null>
}

interface PopupCoords {
  anchorTop: number
  anchorBottom: number
  /** Viewport Y: top edge of the tooltip box */
  tooltipTop: number
  /** Viewport X: left edge of the tooltip box */
  tooltipLeft: number
  /** Tooltip-local X: horizontal center of the arrow (points at word center) */
  arrowCenterX: number
  placement: "above" | "below"
}

const POPUP_MIN_WIDTH = 124
const POPUP_MAX_WIDTH = 240
const POPUP_MIN_HEIGHT = 88
const POPUP_MAX_HEIGHT = 360
/** Hover meaning card — quick fade out (ms) */
const TOOLTIP_FADE_OUT_MS = 0
/** Tooltip box + arrow ease horizontally toward the pointer (ms) */
const TOOLTIP_FOLLOW_POSITION_MS = 45
/** Keep arrow diamond inside tooltip; min distance from edge to arrow center (px) */
const ARROW_EDGE_INSET = 12
const VIEWPORT_EDGE_PADDING = 8
const TOOLTIP_FONT_STACK =
  "\"Manrope\", \"Source Sans 3\", sans-serif"

/** Vertical gap from word to tooltip (article: farther so finger doesn’t cover the card) */
const GAP_FROM_WORD: Record<"article" | "read", number> = { read: 10, article: 36 }
/** Tooltip pointer size (px); article uses a larger tip + gap so the callout clears the finger */
const ARROW_BOX: Record<"article" | "read", number> = { read: 8, article: 11 }
/** Mobile: taps in a chain must fall within this gap (ms) to count toward opening details. */
const TAP_CHAIN_GAP_MS = 550
const TAPS_TO_OPEN_DETAILS_MOBILE = 3

function estimateTooltipHeight(chunk: ChunkData): number {
  // Rough estimate for placement only; tooltip content remains auto-sized by the browser.
  const chars = `${chunk.meaning ?? ""} ${chunk.literal ?? ""} ${chunk.grammar ?? ""}`.trim().length
  const est = POPUP_MIN_HEIGHT + Math.ceil(chars / 36) * 14
  return Math.max(POPUP_MIN_HEIGHT, Math.min(POPUP_MAX_HEIGHT, est))
}

function estimateTooltipWidth(chunk: ChunkData): number {
  const meaning = chunk.meaning?.trim() ?? ""
  const detail = `${chunk.literal ?? ""} ${chunk.grammar ?? ""}`.trim()
  const longest = Math.max(meaning.length, detail.length * 0.8)
  const est = 76 + longest * 7.4
  return Math.max(POPUP_MIN_WIDTH, Math.min(POPUP_MAX_WIDTH, Math.ceil(est)))
}

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

/** Inter-word gap rows from read merge (`text` is only whitespace) — no tooltip / hit target */
function isWhitespaceOnlyChunkText(text: string): boolean {
  return !/[^\s]/u.test(text)
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
  onDoubleClickMenuOnly,
  onRequestDetails,
  variant = "read",
  delegatePointerHover = false,
  followPointerClient = null,
  followPointerRef,
  followPointerPlaceRef,
  suppressDoubleTapAfterExplorationLiftRef,
}: TextChunkProps) {
  if (isPunctuationOnly(chunk.text)) {
    return <span>{chunk.text.trim()}</span>
  }

  if (isWhitespaceOnlyChunkText(chunk.text)) {
    return <span>{chunk.text}</span>
  }

  const isPopupOpen = popupChunkId === chunk.id
  const [coords, setCoords] = useState<PopupCoords | null>(null)
  const chunkRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  /** transitionend must not clear coords if user re-hovered before fade finished */
  const isPopupOpenRef = useRef(isPopupOpen)
  isPopupOpenRef.current = isPopupOpen
  /** Consecutive tap count + time of last tap (mobile triple-tap → details). */
  const tapChainRef = useRef<{ n: number; t: number }>({ n: 0, t: 0 })
  const tapResetTimerRef = useRef<number | null>(null)
  const suppressClickAfterTouchGestureUntilRef = useRef(0)
  /** Last viewport pointer while this chunk’s tooltip is open — reflow scroll/resize */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerRafRef = useRef<number | null>(null)
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null)
  const measuredTooltipSizeRef = useRef<{ width: number; height: number } | null>(null)

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
      const vh = window.innerHeight
      const tooltipWidth =
        measuredTooltipSizeRef.current?.width ?? estimateTooltipWidth(chunk)
      const tooltipHeightEst =
        measuredTooltipSizeRef.current?.height ?? estimateTooltipHeight(chunk)
      const gap = GAP_FROM_WORD[variant]
      const gapForAbove = variant === "read" ? Math.max(4, gap - 2) : gap
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
        spaceAbove < tooltipHeightEst + edgeClearance &&
        spaceBelow >= tooltipHeightEst + edgeClearance
          ? "below"
          : "above"

      const tooltipTopUnclamped =
        placement === "above"
          ? anchorLine.top - gapForAbove - tooltipHeightEst
          : anchorLine.bottom + gap
      const tooltipTop = Math.max(
        VIEWPORT_EDGE_PADDING,
        Math.min(tooltipTopUnclamped, vh - VIEWPORT_EDGE_PADDING - tooltipHeightEst),
      )

      const next: PopupCoords = {
        anchorTop: anchorLine.top,
        anchorBottom: anchorLine.bottom,
        tooltipTop,
        tooltipLeft,
        arrowCenterX,
        placement,
      }
      setCoords((prev) => {
        if (
          prev &&
          prev.placement === next.placement &&
          prev.tooltipLeft === next.tooltipLeft &&
          prev.tooltipTop === next.tooltipTop &&
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
    if (!isPopupOpen || !tooltipRef.current) return
    const rect = tooltipRef.current.getBoundingClientRect()
    const next = {
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    }
    if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) return
    if (
      measuredTooltipSizeRef.current?.width === next.width &&
      measuredTooltipSizeRef.current?.height === next.height
    ) {
      return
    }
    measuredTooltipSizeRef.current = next
    if (delegatePointerHover && followPointerClient) {
      placeTooltip(followPointerClient.x, followPointerClient.y)
      return
    }
    if (delegatePointerHover && followPointerRef?.current) {
      const p = followPointerRef.current
      if (p) placeTooltip(p.x, p.y)
      else placeTooltip(null, null)
      return
    }
    const p = lastPointerRef.current
    placeTooltip(p?.x ?? null, p?.y ?? null)
  }, [
    isPopupOpen,
    coords?.placement,
    coords?.tooltipTop,
    chunk.meaning,
    chunk.literal,
    chunk.grammar,
    delegatePointerHover,
    followPointerClient,
    followPointerRef,
    placeTooltip,
  ])

  useLayoutEffect(() => {
    if (!followPointerPlaceRef) return
    if (!isPopupOpen || !delegatePointerHover) {
      followPointerPlaceRef.current = null
      return
    }
    followPointerPlaceRef.current = (x: number, y: number) => {
      placeTooltip(x, y)
    }
    return () => {
      followPointerPlaceRef.current = null
    }
  }, [isPopupOpen, delegatePointerHover, followPointerPlaceRef, placeTooltip])

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
      const sid = chunk.id
      const suppressLift = suppressDoubleTapAfterExplorationLiftRef
      if (suppressLift && sid != null && suppressLift.current === sid) {
        suppressLift.current = null
        return
      }
      const now = Date.now()
      const prev = tapChainRef.current
      const n =
        prev.n === 0 || now - prev.t > TAP_CHAIN_GAP_MS ? 1 : prev.n + 1
      tapChainRef.current = { n, t: now }

      if (n >= TAPS_TO_OPEN_DETAILS_MOBILE) {
        suppressClickAfterTouchGestureUntilRef.current = now + 650
        onPinToggle?.()
        onRequestDetails?.()
        tapChainRef.current = { n: 0, t: 0 }
        if (tapResetTimerRef.current != null) {
          window.clearTimeout(tapResetTimerRef.current)
          tapResetTimerRef.current = null
        }
      } else {
        if (tapResetTimerRef.current != null) window.clearTimeout(tapResetTimerRef.current)
        tapResetTimerRef.current = window.setTimeout(() => {
          tapChainRef.current = { n: 0, t: 0 }
          tapResetTimerRef.current = null
        }, TAP_CHAIN_GAP_MS + 80)
      }
    },
    [chunk.id, onPinToggle, onRequestDetails, suppressDoubleTapAfterExplorationLiftRef],
  )

  /** Non-passive `touchend` so `preventDefault` suppresses the synthetic click after triple-tap. */
  useLayoutEffect(() => {
    if (!delegatePointerHover || !chunkRef.current) return
    const el = chunkRef.current
    el.addEventListener("touchend", handleTouchEnd, { passive: false })
    return () => {
      el.removeEventListener("touchend", handleTouchEnd)
    }
  }, [delegatePointerHover, handleTouchEnd])

  const gap = GAP_FROM_WORD[variant]
  const arrowSize = ARROW_BOX[variant]

  const { prefix, underline, suffix } = splitChunkTextForUnderline(chunk.text)
  const underlineText = underline.length > 0 ? underline : chunk.text
  const normalizedMeaning = chunk.meaning.trim().toLocaleLowerCase()
  const normalizedLiteral = chunk.literal?.trim().toLocaleLowerCase() ?? ""
  const showLiteral = normalizedLiteral.length > 0 && normalizedLiteral !== normalizedMeaning

  /** Triangle pointer sits outside the card, so no extra content inset is needed. */
  const tailInset = 0
  const pad = 12
  const padX = 16

  const showTooltip = coords !== null
  /** Same motion for mouse + touch: no CSS interpolation while a live pointer drives placement. */
  const followingLiveDelegatedPointer =
    isPopupOpen &&
    delegatePointerHover &&
    (followPointerClient != null || followPointerRef != null)
  const followMotionMs = followingLiveDelegatedPointer ? 0 : TOOLTIP_FOLLOW_POSITION_MS

  const handleTooltipTransitionEnd = useCallback((e: TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== "opacity" || e.target !== e.currentTarget) return
    if (!isPopupOpenRef.current) {
      setCoords(null)
    }
  }, [])

  const popup = showTooltip && coords && (
    <div
      ref={tooltipRef}
      data-popup
      onTransitionEnd={handleTooltipTransitionEnd}
      style={{
        position: "fixed",
        top: coords.tooltipTop,
        left: coords.tooltipLeft,
        width: "max-content",
        minWidth: POPUP_MIN_WIDTH,
        maxWidth: `min(${POPUP_MAX_WIDTH}px, calc(100vw - 32px))`,
        boxSizing: "border-box",
        transform: "none",
        zIndex: 9999,
        /* Portaled above text — pass pointer through so hit-testing stays on the article/read surface */
        pointerEvents: "none",
        opacity: isPopupOpen ? 1 : 0,
        transition: isPopupOpen
          ? `left ${followMotionMs}ms linear, top ${followMotionMs}ms linear, opacity 0ms`
          : `opacity ${TOOLTIP_FADE_OUT_MS}ms ease-out`,
        background: "linear-gradient(180deg, #fffefd 0%, #fcf7f1 100%)",
        border: "1px solid rgba(70, 56, 45, 0.22)",
        borderRadius: "11px",
        boxShadow:
          "0 14px 34px rgba(39, 31, 24, 0.12), 0 2px 8px rgba(39, 31, 24, 0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
        padding:
          coords.placement === "below"
            ? `${pad + tailInset}px ${padX}px ${pad}px ${padX}px`
            : `${pad}px ${padX}px ${pad + tailInset}px ${padX}px`,
        overflow: "visible",
      }}
    >
      {/* Slim triangle pointer to avoid the speech-bubble diamond look. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: arrowSize * 2,
          height: arrowSize,
          left: coords.arrowCenterX,
          transition: isPopupOpen ? `left ${followMotionMs}ms linear` : undefined,
          zIndex: 2,
          backgroundColor: "#fcf7f1",
          clipPath: "polygon(50% 100%, 0 0, 100% 0)",
          transform:
            coords.placement === "above"
              ? "translateX(-50%) translateY(100%)"
              : "translateX(-50%) translateY(-100%) rotate(180deg)",
          ...(coords.placement === "above"
            ? {
                bottom: 0,
                filter: "drop-shadow(0 1px 0 rgba(70,56,45,0.22))",
              }
            : {
                top: 0,
                filter: "drop-shadow(0 -1px 0 rgba(70,56,45,0.22))",
              }),
        }}
      />

      <div
        className="chunk-tooltip-body"
        key={chunk.id != null ? `c${chunk.id}-${chunk.meaning}` : `${chunk.text}-${chunk.meaning}`}
        style={{ maxWidth: POPUP_MAX_WIDTH - padX * 2 }}
      >
        <p style={{ fontSize: "1.02rem", fontFamily: TOOLTIP_FONT_STACK, fontWeight: 650, color: "#211b17", lineHeight: 1.16, letterSpacing: "-0.008em", margin: 0 }}>
          {chunk.meaning}
        </p>

        {(showLiteral || chunk.grammar) && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(124, 102, 84, 0.14)" }}>
            {showLiteral && (
              <p style={{ margin: "0 0 4px", fontSize: "0.76rem", lineHeight: 1.34, color: "#4e443c" }}>
                <span style={{ fontFamily: TOOLTIP_FONT_STACK, fontSize: "0.54rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#8c7c6d" }}>Literal</span>
                <span style={{ margin: "0 6px", color: "#b47a5a", opacity: 0.8 }}>·</span>
                {chunk.literal}
              </p>
            )}
            {chunk.grammar && (
              <p style={{ margin: 0, fontSize: "0.76rem", lineHeight: 1.34, color: "#4e443c" }}>
                <span style={{ fontFamily: TOOLTIP_FONT_STACK, fontStyle: "normal", fontSize: "0.54rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#8c7c6d" }}>Note</span>
                <span style={{ margin: "0 6px", color: "#b47a5a", opacity: 0.8 }}>·</span>
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
          if (Date.now() < suppressClickAfterTouchGestureUntilRef.current) return
          onActivate()
          onRequestDetails?.()
        }}
        onMouseEnter={delegatePointerHover ? undefined : onActivate}
        onMouseLeave={delegatePointerHover ? undefined : onDeactivate}
        onMouseMove={delegatePointerHover ? undefined : handleChunkMouseMove}
        onTouchEnd={delegatePointerHover ? undefined : handleTouchEnd}
        onDoubleClick={(e) => {
          e.preventDefault()
          onDoubleClickMenuOnly?.()
          onPinToggle?.()
        }}
        className="inline cursor-pointer"
      >
        {prefix ? <span>{prefix}</span> : null}
        <span
          className={cn(
            /* Keep underline in the tree so decoration-color can fade (snap-off feels harsh) */
            "rounded-sm px-0.5 -mx-0.5 underline underline-offset-2 decoration-[3px]",
            "transition-[text-decoration-color,background-color] duration-700 ease-out md:duration-500",
            isPinned
              ? "bg-primary/10 text-foreground decoration-[#c97a5a]/75"
              : isTouchHighlight
                ? "text-foreground decoration-[#c97a5a]/60 bg-transparent"
                : "text-foreground decoration-transparent",
          )}
        >
          {underlineText}
        </span>
        {suffix ? <span>{suffix}</span> : null}
      </span>

      {typeof document !== "undefined" && popup && createPortal(popup, document.body)}
    </span>
  )
}
