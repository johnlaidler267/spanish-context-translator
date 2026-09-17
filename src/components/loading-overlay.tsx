"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

const MESSAGES = [
  "Analyzing your text…",
  "Reading for context…",
  "Translating…",
  "Almost there…",
]

/**
 * How long the progress bar takes to fill from 0 to 100%, at a constant rate. This is a fixed
 * visual animation to keep the user occupied while a request is in flight -- it's deliberately
 * not tied to when the real work behind it (a network fetch, a page-split reflow) actually
 * finishes: gating the fill on real progress meant the bar could stall partway (waiting on the
 * real work) or sit at a stale 100% (real work finishing early), both of which read as broken.
 * A plain constant-rate fill never does either -- it just always finishes, and the caller decides
 * separately how long to keep the overlay up (see src/App.tsx's `LANDING_MIN_LOADING_MS`, kept in
 * sync with this).
 */
export const LOADING_OVERLAY_PROGRESS_MS = 1500

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
      setBarWidth(linearT * 100)
      if (linearT < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const percentLabel = Math.round(barWidth)

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
