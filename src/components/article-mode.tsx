"use client"

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  type SetStateAction,
} from "react"
import { TextChunk } from "./text-chunk"
import {
  getChunkIdFromPointerClientXY,
  useChunkTouchExploration,
} from "@/hooks/use-chunk-touch-exploration"
import { cn } from "@/lib/utils"
import { READING_CONTENT_TOP_MOBILE_REM } from "@/lib/reading-layout"

interface ChunkData {
  id: number
  text: string
  meaning: string
  literal?: string
  grammar?: string
}

interface ArticleModeProps {
  chunks: ChunkData[]
}

const CHUNK_HOVER_GAP_CLEAR_MS = 90

export function ArticleMode({ chunks }: ArticleModeProps) {
  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)
  const [tooltipPointer, setTooltipPointer] = useState<{ x: number; y: number } | null>(null)
  const exploringLeaveTimerRef = useRef<number | null>(null)
  const pointerHoverRafRef = useRef<number | null>(null)
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null)
  const pointerLastIdRef = useRef<number | null>(null)

  const cancelExploringLeaveTimer = useCallback(() => {
    if (exploringLeaveTimerRef.current != null) {
      window.clearTimeout(exploringLeaveTimerRef.current)
      exploringLeaveTimerRef.current = null
    }
  }, [])

  const commitExploringChunkId = useCallback(
    (action: SetStateAction<number | null>) => {
      cancelExploringLeaveTimer()
      setExploringChunkId(action)
    },
    [cancelExploringLeaveTimer],
  )

  const scheduleExploringLeave = useCallback(() => {
    cancelExploringLeaveTimer()
    exploringLeaveTimerRef.current = window.setTimeout(() => {
      exploringLeaveTimerRef.current = null
      setExploringChunkId(null)
    }, CHUNK_HOVER_GAP_CLEAR_MS)
  }, [cancelExploringLeaveTimer])

  useEffect(() => () => cancelExploringLeaveTimer(), [cancelExploringLeaveTimer])

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(commitExploringChunkId, [chunks])

  useEffect(() => {
    if (touchExploring) setTooltipPointer(null)
  }, [touchExploring])

  useLayoutEffect(() => {
    const el = touchSurfaceRef.current
    if (!el) return

    const applyHit = (clientX: number, clientY: number) => {
      const id = getChunkIdFromPointerClientXY(clientX, clientY, el)

      if (id != null) {
        cancelExploringLeaveTimer()
        if (id === pointerLastIdRef.current) return
        pointerLastIdRef.current = id
        setExploringChunkId((prev) => (prev === id ? prev : id))
        return
      }

      if (pointerLastIdRef.current == null) return
      if (exploringLeaveTimerRef.current != null) return
      exploringLeaveTimerRef.current = window.setTimeout(() => {
        exploringLeaveTimerRef.current = null
        pointerLastIdRef.current = null
        setExploringChunkId(null)
      }, CHUNK_HOVER_GAP_CLEAR_MS)
    }

    const flushHitTest = () => {
      pointerHoverRafRef.current = null
      const p = pointerPendingRef.current
      if (!p) return
      applyHit(p.x, p.y)
      setTooltipPointer({ x: p.x, y: p.y })
    }

    const onMouseEnter = (e: MouseEvent) => {
      pointerPendingRef.current = { x: e.clientX, y: e.clientY }
      setTooltipPointer({ x: e.clientX, y: e.clientY })
      applyHit(e.clientX, e.clientY)
    }

    const onMouseMove = (e: MouseEvent) => {
      pointerPendingRef.current = { x: e.clientX, y: e.clientY }
      setTooltipPointer({ x: e.clientX, y: e.clientY })
      if (pointerHoverRafRef.current != null) return
      pointerHoverRafRef.current = requestAnimationFrame(flushHitTest)
    }

    const onMouseLeave = (e: MouseEvent) => {
      const rt = e.relatedTarget
      if (
        rt instanceof Element &&
        (rt.closest("[data-popup]") || rt.closest("[data-details-box]"))
      ) {
        return
      }
      cancelExploringLeaveTimer()
      pointerPendingRef.current = null
      pointerLastIdRef.current = null
      setTooltipPointer(null)
      if (pointerHoverRafRef.current != null) {
        cancelAnimationFrame(pointerHoverRafRef.current)
        pointerHoverRafRef.current = null
      }
      setExploringChunkId(null)
    }

    el.addEventListener("mouseenter", onMouseEnter, { passive: true })
    el.addEventListener("mousemove", onMouseMove, { passive: true })
    el.addEventListener("mouseleave", onMouseLeave)
    return () => {
      el.removeEventListener("mouseenter", onMouseEnter)
      el.removeEventListener("mousemove", onMouseMove)
      el.removeEventListener("mouseleave", onMouseLeave)
      if (pointerHoverRafRef.current != null) {
        cancelAnimationFrame(pointerHoverRafRef.current)
        pointerHoverRafRef.current = null
      }
      pointerPendingRef.current = null
      pointerLastIdRef.current = null
      cancelExploringLeaveTimer()
    }
  }, [cancelExploringLeaveTimer])

  const effectivePopupId = useMemo(
    () => (exploringChunkId != null ? exploringChunkId : pinnedChunkId),
    [exploringChunkId, pinnedChunkId],
  )

  const handleGlobalClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest("[data-chunk]") && !target.closest("[data-popup]")) {
      cancelExploringLeaveTimer()
      setTooltipPointer(null)
      setExploringChunkId(null)
      setPinnedChunkId(null)
    }
  }, [cancelExploringLeaveTimer])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  return (
    <div
      className="w-full mx-auto px-6 md:px-8 md:pt-24 max-md:pt-[calc(env(safe-area-inset-top,0px)+var(--reading-content-top))] pb-16"
      style={{
        maxWidth: "700px",
        ["--reading-content-top" as string]: `${READING_CONTENT_TOP_MOBILE_REM}rem`,
      }}
    >
      <article
        ref={touchSurfaceRef}
        className={cn(
          "font-serif text-xl md:text-2xl leading-[1.75] md:leading-[1.85] text-foreground selection:bg-primary/20",
          touchExploring && "touch-none select-none",
        )}
      >
        {chunks.map((chunk, index) => (
          <span key={chunk.id}>
            <TextChunk
              variant="article"
              chunk={chunk}
              popupChunkId={effectivePopupId}
              delegatePointerHover
              followPointerClient={
                !touchExploring &&
                effectivePopupId === chunk.id &&
                tooltipPointer != null
                  ? tooltipPointer
                  : null
              }
              isTouchHighlight={exploringChunkId === chunk.id}
              isPinned={pinnedChunkId === chunk.id}
              onActivate={() => commitExploringChunkId(chunk.id)}
              onDeactivate={() => {
                if (pinnedChunkId !== chunk.id) scheduleExploringLeave()
              }}
              onPinToggle={() => setPinnedChunkId(prev => (prev === chunk.id ? null : chunk.id))}
            />
            {index < chunks.length - 1 && " "}
          </span>
        ))}
      </article>
    </div>
  )
}
