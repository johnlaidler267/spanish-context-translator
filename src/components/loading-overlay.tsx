"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const MESSAGES = [
  "Analyzing your text…",
  "Reading for context…",
  "Translating…",
  "Almost there…",
]

/** Keep in sync with landing min loading delay for a full-fill handoff. */
export const LOADING_OVERLAY_PROGRESS_MS = 1000

/** Former `animation-timing-function: cubic-bezier(0.25, 0.1, 0.1, 1)`, still used for the fast
 *  initial climb below. */
const BEZ = { x1: 0.25, y1: 0.1, x2: 0.1, y2: 1 }

function sampleCurveX(t: number): number {
  const c = 3 * BEZ.x1
  const b = 3 * (BEZ.x2 - BEZ.x1) - c
  const a = 1 - c - b
  return ((a * t + b) * t + c) * t
}

function sampleCurveY(t: number): number {
  const c = 3 * BEZ.y1
  const b = 3 * (BEZ.y2 - BEZ.y1) - c
  const a = 1 - c - b
  return ((a * t + b) * t + c) * t
}

/** Map linear clock 0–1 to eased curve position 0–1 (matches the former CSS animation). */
function easedProgress(linearT: number): number {
  const x = Math.min(1, Math.max(0, linearT))
  if (x <= 0) return 0
  if (x >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (sampleCurveX(mid) < x) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  return sampleCurveY(t)
}

/** Width the fast initial climb reaches by `LOADING_OVERLAY_PROGRESS_MS` -- kept well short of
 *  100 so there's always a visible stretch of "still going" bar left for however much longer the
 *  real work behind it (a page-split reflow, a slow network round trip) actually takes. */
const FAST_PHASE_END_WIDTH = 80

/** Width the slow crawl (see `fakeProgressWidth` below) approaches but never reaches on its own.
 *  Left short of 100 so a `ready` handoff always has real distance left to close instead of the
 *  bar arriving there by coincidence and looking done before the app is ready to navigate. */
const SLOW_CRAWL_CEILING_WIDTH = 97

/** How long it takes the slow crawl to close half the remaining distance to its ceiling. Smaller
 *  = faster-looking progress; kept large enough that the crawl stays visibly moving for a good
 *  several seconds instead of flattening out right away. */
const SLOW_CRAWL_HALF_LIFE_MS = 3500

/** How long the final close-out to 100% takes once the real work is actually done. */
const FINISH_ANIMATION_MS = 300

/**
 * The bar width driven purely by wall-clock time since the overlay mounted, with no notion of
 * whether the real work behind it is actually done -- a deliberately "fake" progress curve (a
 * quick initial climb, then an ever-slowing crawl toward, but never reaching,
 * `SLOW_CRAWL_CEILING_WIDTH`) so the bar is always visibly advancing, however long the real work
 * ends up taking, rather than sitting frozen at some intermediate width. Exported (pure, no
 * DOM/React) so the curve is unit-testable without rendering the component.
 */
export function fakeProgressWidth(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  if (elapsedMs < LOADING_OVERLAY_PROGRESS_MS) {
    return easedProgress(elapsedMs / LOADING_OVERLAY_PROGRESS_MS) * FAST_PHASE_END_WIDTH
  }
  const slowElapsedMs = elapsedMs - LOADING_OVERLAY_PROGRESS_MS
  const approach = 1 - Math.pow(0.5, slowElapsedMs / SLOW_CRAWL_HALF_LIFE_MS)
  return FAST_PHASE_END_WIDTH + (SLOW_CRAWL_CEILING_WIDTH - FAST_PHASE_END_WIDTH) * approach
}

/**
 * The bar width during the short close-out animation once the real work is actually done: eases
 * from wherever the fake crawl above happened to be at that moment up to a full 100%, instead of
 * jumping there instantly. Exported for the same reason as `fakeProgressWidth`.
 */
export function finishProgressWidth(widthAtReady: number, elapsedSinceReadyMs: number): number {
  if (elapsedSinceReadyMs <= 0) return widthAtReady
  const t = Math.min(1, elapsedSinceReadyMs / FINISH_ANIMATION_MS)
  const eased = 1 - Math.pow(1 - t, 3)
  return widthAtReady + (100 - widthAtReady) * eased
}

type LoadingOverlayProps = {
  withBackdrop?: boolean
  /**
   * Whether the real work this overlay is covering for has actually finished. Before this flips
   * true the bar follows the always-advancing `fakeProgressWidth` curve regardless of real
   * progress; once it flips, the bar eases from wherever that curve was up to a full 100% over
   * `FINISH_ANIMATION_MS` (see `finishProgressWidth`). Defaults to `true` (bar just runs its fake
   * curve to completion) -- pass `false` while the real work is still in flight and flip it to
   * `true` right when it finishes. See src/App.tsx's `loadingSetupReady` for the call site that
   * does this.
   */
  ready?: boolean
}

export function LoadingOverlay({ withBackdrop = true, ready = true }: LoadingOverlayProps) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [barWidth, setBarWidth] = useState(0)
  const [mounted, setMounted] = useState(false)

  const readyRef = useRef(ready)
  const readyAtRef = useRef<number | null>(null)
  const widthAtReadyRef = useRef(0)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    readyRef.current = ready
  }, [ready])

  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      if (!readyRef.current) {
        setBarWidth(fakeProgressWidth(now - start))
        frame = requestAnimationFrame(tick)
        return
      }
      // First tick after `ready` flips true: freeze the hand-off point the finish animation
      // eases from, using whatever the fake curve had reached rather than jumping from wherever
      // it happened to already be mid-frame.
      if (readyAtRef.current == null) {
        readyAtRef.current = now
        widthAtReadyRef.current = fakeProgressWidth(now - start)
      }
      const finished = finishProgressWidth(widthAtReadyRef.current, now - readyAtRef.current)
      setBarWidth(finished)
      if (finished < 100) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const percentLabel = Math.min(100, Math.round(barWidth))

  // Cycle through messages every ~3s
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setMsgIndex(i => Math.min(i + 1, MESSAGES.length - 1))
        setVisible(true)
      }, 250)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  const wrapperClasses = withBackdrop
    ? "fixed inset-0 z-[60] flex items-center justify-center bg-background/85 backdrop-blur-sm"
    : "fixed inset-0 z-[60] pointer-events-none flex items-center justify-center"

  if (!mounted) return null

  return createPortal(
    <div className={wrapperClasses}>
      <div className="flex flex-col items-center gap-5 w-48">

        <p
          className="text-foreground font-sans text-sm tabular-nums tracking-tight"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentLabel}
          aria-label="Translation progress"
        >
          {percentLabel}%
        </p>

        {/* Progress bar */}
        <div className="w-full h-[2px] rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-none"
            style={{ width: `${barWidth}%` }}
          />
        </div>

        {/* Cycling label */}
        <p
          className="text-muted-foreground font-sans text-xs tracking-wide transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {MESSAGES[msgIndex]}
        </p>

      </div>
    </div>,
    document.body,
  )
}
