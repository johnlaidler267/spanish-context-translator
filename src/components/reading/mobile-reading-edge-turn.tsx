"use client"

import { useEffect, useRef } from "react"

/** Match Tailwind `md` — edge turns are mobile-only. */
const MOBILE_MAX_PX = 767

/** Horizontal fraction from each screen edge that counts as “left / right”. */
const EDGE_X_FRAC = 0.28

/** Same feel as quick successive taps near the chunk triple-tap window. */
const DOUBLE_TAP_MS = 420

const RESET_MS = 450

interface MobileReadingEdgeTurnProps {
  enabled: boolean
  canGoPrevious: boolean
  canGoNext: boolean
  onPrevious: () => void
  onNext: () => void
}

/**
 * Double-tap near the left or right edge of the viewport (mobile) to go
 * previous / next. Skips touches on chunks, tooltips, details, and header chrome.
 */
export function MobileReadingEdgeTurn({
  enabled,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: MobileReadingEdgeTurnProps) {
  const lastRef = useRef<{ side: "left" | "right"; t: number } | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_PX}px)`)
    const isMobile = () => mq.matches

    const clearResetTimer = () => {
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    }

    const eligibleTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      return !target.closest(
        "[data-chunk],[data-popup],[data-details-box],[data-app-error-modal],button,a,input,textarea,select,[role='dialog'],[role='alertdialog']",
      )
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!isMobile()) return
      const touch = e.changedTouches[0]
      if (!touch) return

      const header = document.querySelector("header")
      if (header) {
        const bottom = header.getBoundingClientRect().bottom
        if (touch.clientY < bottom + 6) return
      }

      if (!eligibleTarget(e.target)) return

      const w = window.innerWidth
      const x = touch.clientX
      const leftEdge = x < w * EDGE_X_FRAC
      const rightEdge = x > w * (1 - EDGE_X_FRAC)
      if (!leftEdge && !rightEdge) return

      const side: "left" | "right" = leftEdge ? "left" : "right"
      const now = Date.now()
      const last = lastRef.current

      if (last && last.side === side && now - last.t < DOUBLE_TAP_MS) {
        clearResetTimer()
        lastRef.current = null
        if (side === "left" && canGoPrevious) onPrevious()
        else if (side === "right" && canGoNext) onNext()
        return
      }

      lastRef.current = { side, t: now }
      clearResetTimer()
      resetTimerRef.current = window.setTimeout(() => {
        lastRef.current = null
        resetTimerRef.current = null
      }, RESET_MS)
    }

    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true })
    return () => {
      document.removeEventListener("touchend", onTouchEnd, { capture: true })
      clearResetTimer()
      lastRef.current = null
    }
  }, [enabled, canGoPrevious, canGoNext, onPrevious, onNext])

  return null
}
