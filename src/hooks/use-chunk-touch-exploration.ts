"use client"

import { useState, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react"

/** Word under touch / pointer — used for thumb exploration on mobile */
export function getChunkIdFromPoint(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  if (!el) return null
  const hit = el.closest("[data-chunk-id]") as HTMLElement | null
  if (!hit) return null
  const raw = hit.getAttribute("data-chunk-id")
  if (raw == null) return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

/**
 * Touch down = show tooltip for word under thumb; drag = follow word under finger;
 * lift = hide. (Press-and-explore — not tap-to-toggle per word.)
 */
export function useChunkTouchExploration(
  setActiveChunkId: Dispatch<SetStateAction<number | null>>,
  effectDeps: unknown[],
) {
  const ref = useRef<HTMLDivElement>(null)
  const touchExploringRef = useRef(false)
  const lastEmittedIdRef = useRef<number | null>(null)
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const [touchExploring, setTouchExploring] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const runHitTest = () => {
      const p = pendingPointRef.current
      if (!p || !touchExploringRef.current) return
      const id = getChunkIdFromPoint(p.x, p.y)
      if (id === lastEmittedIdRef.current) return
      lastEmittedIdRef.current = id
      setActiveChunkId(id)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      touchExploringRef.current = true
      setTouchExploring(true)
      pendingPointRef.current = { x: t.clientX, y: t.clientY }
      const id = getChunkIdFromPoint(t.clientX, t.clientY)
      lastEmittedIdRef.current = id
      setActiveChunkId(id)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!touchExploringRef.current || e.touches.length !== 1) return
      e.preventDefault()
      const tt = e.touches[0]
      pendingPointRef.current = { x: tt.clientX, y: tt.clientY }
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        runHitTest()
      })
    }

    const endTouchExploration = () => {
      if (!touchExploringRef.current) return
      touchExploringRef.current = false
      setTouchExploring(false)
      lastEmittedIdRef.current = null
      setActiveChunkId(null)
      pendingPointRef.current = null
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", endTouchExploration)
    el.addEventListener("touchcancel", endTouchExploration)

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", endTouchExploration)
      el.removeEventListener("touchcancel", endTouchExploration)
      touchExploringRef.current = false
      setTouchExploring(false)
    }
  }, [setActiveChunkId, ...effectDeps])

  useLayoutEffect(() => {
    if (touchExploring) {
      document.body.classList.add("read-mode-touch-exploring")
      document.documentElement.style.overflow = "hidden"
    } else {
      document.body.classList.remove("read-mode-touch-exploring")
      document.documentElement.style.overflow = ""
    }
    return () => {
      document.body.classList.remove("read-mode-touch-exploring")
      document.documentElement.style.overflow = ""
    }
  }, [touchExploring])

  return { ref, touchExploring }
}
