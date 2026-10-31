"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"

/** Set once the reader has looked up a phrase or closed the tip — never shown again on this device. */
export const FIRST_READ_TIP_STORAGE_KEY = "lexa.firstReadTipSeen.v1"

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(FIRST_READ_TIP_STORAGE_KEY) === "1"
  } catch {
    // Storage blocked (private mode etc.): treat as seen rather than nag on every visit.
    return true
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(FIRST_READ_TIP_STORAGE_KEY, "1")
  } catch {
    /* ignore */
  }
}

interface FirstReadTipProps {
  /** Hold the tip back while something else (e.g. the where-you-left-off modal) is on screen. */
  suppressed?: boolean
}

/**
 * One-time hint for a brand-new reader: nothing on the page says phrases are interactive, so
 * someone could read a whole page without discovering the core feature. Goes away for good on
 * the first press on a phrase (any pointer) or when closed.
 */
export function FirstReadTip({ suppressed = false }: FirstReadTipProps) {
  const [seen, setSeen] = useState(readSeen)
  const isTouch = useMediaQuery("(hover: none)")

  useEffect(() => {
    if (seen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-chunk-id]")) return
      markSeen()
      setSeen(true)
    }
    // Capture phase: chunk handlers stop/prevent some touch events, but never pointerdown capture.
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [seen])

  if (seen || suppressed) return null

  const dismiss = () => {
    markSeen()
    setSeen(true)
  }

  return createPortal(
    <div
      role="status"
      data-testid="first-read-tip"
      // Phones: lifted clear of the page counter/arrows that sit along the bottom edge there.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-40 flex justify-center px-4 animate-fade-in-up max-md:bottom-[calc(env(safe-area-inset-bottom)+6.5rem)]"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 py-2.5 pl-4 pr-2 text-sm text-foreground shadow-lg backdrop-blur">
        <p className="leading-snug">
          {isTouch ? (
            <>
              <strong className="font-semibold">Press and hold</strong> any phrase to see what it
              means — slide your finger to keep going.
            </>
          ) : (
            <>
              <strong className="font-semibold">Hover</strong> any phrase to see what it means —
              click it for the full breakdown.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={(e) => {
            // Don't let the reading surface's tap handler treat this as a page tap.
            e.stopPropagation()
            dismiss()
          }}
          aria-label="Dismiss tip"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
