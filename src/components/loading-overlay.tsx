"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"

const MESSAGES = [
  "Analyzing your text…",
  "Reading for context…",
  "Translating…",
  "Almost there…",
]

/** Keep in sync with landing min loading delay for a full-fill handoff. */
export const LOADING_OVERLAY_PROGRESS_MS = 1000

/** Former `@keyframes progress-fill` width stops (keyframe time → bar width %). */
const WIDTH_STOPS: [number, number][] = [
  [0, 0],
  [0.2, 48],
  [0.45, 68],
  [0.7, 80],
  [0.88, 92],
  [1, 100],
]

/** Former `animation-timing-function: cubic-bezier(0.25, 0.1, 0.1, 1)`. */
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

/** Map linear clock 0–1 to eased keyframe timeline position 0–1 (matches CSS animation). */
function easedKeyframeProgress(linearT: number): number {
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

function barWidthAtKeyframeProgress(p: number): number {
  const clamped = Math.min(1, Math.max(0, p))
  for (let i = 0; i < WIDTH_STOPS.length - 1; i++) {
    const [t0, w0] = WIDTH_STOPS[i]!
    const [t1, w1] = WIDTH_STOPS[i + 1]!
    if (clamped <= t1) {
      const u = t1 === t0 ? 1 : (clamped - t0) / (t1 - t0)
      return w0 + u * (w1 - w0)
    }
  }
  return 92
}

type LoadingOverlayProps = {
  withBackdrop?: boolean
}

export function LoadingOverlay({ withBackdrop = true }: LoadingOverlayProps) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [barWidth, setBarWidth] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const linearT = Math.min(1, (now - start) / LOADING_OVERLAY_PROGRESS_MS)
      const kp = easedKeyframeProgress(linearT)
      setBarWidth(barWidthAtKeyframeProgress(kp))
      if (linearT < 1) frame = requestAnimationFrame(tick)
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
