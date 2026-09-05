import { useCallback, useEffect, useRef, type MutableRefObject } from "react"

/**
 * Mobile press-and-explore: lifting the finger after actually dragging across the text
 * (previewing words) must not seed TextChunk’s tap chain — only a still tap should. Tracks
 * per-chunk drag-lift ordinals and arms a ref consumed by TextChunk.
 */
export function useExplorationDoubleTapLiftSuppress(
  ...resetDeps: unknown[]
): {
  suppressDoubleTapAfterExplorationLiftRef: MutableRefObject<number | null>
  onExplorationLiftChunk: (chunkId: number | null) => void
} {
  const exploreLiftCountByChunkRef = useRef<Map<number, number>>(new Map())
  const suppressDoubleTapAfterExplorationLiftRef = useRef<number | null>(null)

  const onExplorationLiftChunk = useCallback((chunkId: number | null) => {
    if (chunkId == null) {
      suppressDoubleTapAfterExplorationLiftRef.current = null
      return
    }
    const m = exploreLiftCountByChunkRef.current
    const next = (m.get(chunkId) ?? 0) + 1
    m.set(chunkId, next)
    if (next === 1) {
      suppressDoubleTapAfterExplorationLiftRef.current = chunkId
      window.setTimeout(() => {
        if (suppressDoubleTapAfterExplorationLiftRef.current === chunkId) {
          suppressDoubleTapAfterExplorationLiftRef.current = null
        }
      }, 150)
    } else {
      suppressDoubleTapAfterExplorationLiftRef.current = null
    }
  }, [])

  useEffect(() => {
    exploreLiftCountByChunkRef.current.clear()
    suppressDoubleTapAfterExplorationLiftRef.current = null
  }, resetDeps)

  return { suppressDoubleTapAfterExplorationLiftRef, onExplorationLiftChunk }
}
