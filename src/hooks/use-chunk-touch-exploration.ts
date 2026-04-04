"use client"

import { useState, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react"

function parseChunkIdFromElement(el: Element | null | undefined): number | null {
  if (!el) return null
  const hit = el.closest("[data-chunk-id]") as HTMLElement | null
  if (!hit) return null
  const raw = hit.getAttribute("data-chunk-id")
  if (raw == null) return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

function chunkIdFromCaretNode(node: Node | null): number | null {
  if (!node) return null
  const el =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : node instanceof Element
        ? node
        : null
  return parseChunkIdFromElement(el)
}

/** Word under touch / pointer — used for thumb exploration on mobile */
export function getChunkIdFromPoint(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  return parseChunkIdFromElement(el)
}

/**
 * Hit-test using each chunk’s line boxes (getClientRects). Picks the smallest rect
 * that contains the point so overlapping inline spans (-mx) prefer the tighter glyph box.
 */
function getChunkIdFromLineRectsInRoot(
  clientX: number,
  clientY: number,
  root: Element,
): number | null {
  let bestId: number | null = null
  let bestArea = Infinity
  const chunks = root.querySelectorAll<HTMLElement>("[data-chunk-id]")
  for (let c = 0; c < chunks.length; c++) {
    const el = chunks[c]!
    const list = el.getClientRects()
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!
      if (r.width <= 0 && r.height <= 0) continue
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        const area = r.width * r.height
        if (area < bestArea) {
          bestArea = area
          const raw = el.getAttribute("data-chunk-id")
          const id = raw != null ? Number(raw) : NaN
          if (Number.isFinite(id)) bestId = id
        }
      }
    }
  }
  return bestId
}

function getChunkIdFromCaretUnderRoot(
  clientX: number,
  clientY: number,
  root: Element,
): number | null {
  try {
    const doc = document as Document & {
      caretRangeFromPoint?(x: number, y: number): Range | null
      caretPositionFromPoint?(x: number, y: number): CaretPosition | null
    }
    if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(clientX, clientY)
      if (range) {
        const id = chunkIdFromCaretNode(range.startContainer)
        if (id != null) {
          const node = range.startContainer
          const el =
            node.nodeType === Node.TEXT_NODE
              ? node.parentElement
              : node instanceof Element
                ? node
                : null
          if (el && root.contains(el)) return id
        }
      }
    }
    if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(clientX, clientY)
      if (pos?.offsetNode) {
        const id = chunkIdFromCaretNode(pos.offsetNode)
        if (id != null) {
          const node = pos.offsetNode
          const el =
            node.nodeType === Node.TEXT_NODE
              ? node.parentElement
              : node instanceof Element
                ? node
                : null
          if (el && root.contains(el)) return id
        }
      }
    }
  } catch {
    /* strict mode / unsupported */
  }
  return null
}

/** First chunk under point in topmost paint order, restricted to descendants of root. */
function getChunkIdFromElementStackInRoot(
  clientX: number,
  clientY: number,
  root: Element,
): number | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (let i = 0; i < stack.length; i++) {
    const node = stack[i]!
    if (!(node instanceof Element)) continue
    if (!root.contains(node)) continue
    const id = parseChunkIdFromElement(node)
    if (id != null) return id
  }
  return null
}

/**
 * Desktop read mode: when `root` is the sentence surface, uses line-rect hit testing
 * (matches painted glyphs) and ignores portaled UI above the text. Without `root`,
 * falls back to caret + elementFromPoint (legacy).
 */
export function getChunkIdFromPointerClientXY(
  clientX: number,
  clientY: number,
  root?: Element | null,
): number | null {
  if (root) {
    const byRect = getChunkIdFromLineRectsInRoot(clientX, clientY, root)
    if (byRect != null) return byRect
    const byCaret = getChunkIdFromCaretUnderRoot(clientX, clientY, root)
    if (byCaret != null) return byCaret
    return getChunkIdFromElementStackInRoot(clientX, clientY, root)
  }
  try {
    const doc = document as Document & {
      caretRangeFromPoint?(x: number, y: number): Range | null
      caretPositionFromPoint?(x: number, y: number): CaretPosition | null
    }
    if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(clientX, clientY)
      if (range) {
        const id = chunkIdFromCaretNode(range.startContainer)
        if (id != null) return id
      }
    }
    if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(clientX, clientY)
      if (pos?.offsetNode) {
        const id = chunkIdFromCaretNode(pos.offsetNode)
        if (id != null) return id
      }
    }
  } catch {
    /* strict mode / unsupported */
  }
  return getChunkIdFromPoint(clientX, clientY)
}

/**
 * Touch down = show tooltip for word under thumb; drag = follow word under finger;
 * lift = hide. (Press-and-explore — not tap-to-toggle per word.)
 */
export function useChunkTouchExploration(
  setActiveChunkId: Dispatch<SetStateAction<number | null>>,
  dep0: unknown,
  dep1?: unknown,
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
  }, [setActiveChunkId, dep0, dep1])

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
