"use client"

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type SetStateAction,
} from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { TextChunk } from "./text-chunk"
import { gapBetweenReconciledChunks, type ReconciledItem } from "@/lib/translate"
import {
  getChunkIdFromPointerClientXY,
  useChunkTouchExploration,
} from "@/hooks/use-chunk-touch-exploration"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { READING_CONTENT_TOP_MOBILE_REM } from "@/lib/reading-layout"
import { DetailsBox } from "./details-box"
import { useChunkDetails } from "@/hooks/use-chunk-details"
import { AppErrorModal } from "./app-error-modal"
import { translationErrorForUserModal } from "@/lib/translation-error-ui"
import { MobileReadingEdgeTurn } from "./mobile-reading-edge-turn"
import { useReadingPageEnterAnimation } from "@/hooks/use-reading-page-enter"
import {
  cancelHoverSpeech,
  speakHoverChunk,
  speechUnlockForTouchGesture,
} from "@/lib/hover-tts"

let DevArticleMachineTranslate: LazyExoticComponent<
  ComponentType<{ pageText: string; disabled?: boolean }>
> | null = null
if (import.meta.env.DEV) {
  DevArticleMachineTranslate = lazy(() => import("./dev-article-machine-translate"))
}

export type ArticlePaginationState = {
  pageIndex: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  /** Next page is in flight after user chose Next (spinner on control until advance). */
  nextPageLoading: boolean
  /** User can request the next page (current page ready; load runs on Next if not cached). */
  nextPageOpen: boolean
}

interface ArticleContentProps {
  items: ReconciledItem[] | null
  loading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
  pagination?: ArticlePaginationState | null
  pageKey?: number
  /** When true, speak the Spanish chunk under the pointer (Web Speech API). */
  hoverTtsEnabled?: boolean
}

const CHUNK_HOVER_GAP_CLEAR_MS = 90

function articleChunkTextByNumericId(
  items: ReconciledItem[],
  id: number,
): string | null {
  let cid = 0
  for (const it of items) {
    if (it.type === "text" || it.type === "chapter") continue
    if (cid === id) return it.chunk
    cid++
  }
  return null
}

export function ArticleContent({
  items,
  loading = false,
  errorMessage = null,
  onRetry,
  pagination = null,
  pageKey = 0,
  hoverTtsEnabled = false,
}: ArticleContentProps) {
  const [errorModalDismissed, setErrorModalDismissed] = useState(false)
  useEffect(() => {
    setErrorModalDismissed(false)
  }, [pageKey, errorMessage])

  const [exploringChunkId, setExploringChunkId] = useState<number | null>(null)
  const [pinnedChunkId, setPinnedChunkId] = useState<number | null>(null)
  const [menuOnlyChunkId, setMenuOnlyChunkId] = useState<number | null>(null)
  const chunkDetails = useChunkDetails()
  const [tooltipPointer, setTooltipPointer] = useState<{ x: number; y: number } | null>(null)
  const tooltipFollowRef = useRef<{ x: number; y: number } | null>(null)
  const followTooltipPlaceRef = useRef<((x: number, y: number) => void) | null>(null)
  const exploringLeaveTimerRef = useRef<number | null>(null)
  const pointerHoverRafRef = useRef<number | null>(null)
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null)
  const pointerLastIdRef = useRef<number | null>(null)
  const hoverTtsEnabledRef = useRef(hoverTtsEnabled)
  hoverTtsEnabledRef.current = hoverTtsEnabled
  const itemsRef = useRef(items)
  itemsRef.current = items
  const hoverTtsLastSpokenIdRef = useRef<number | null>(null)
  const speakExploreChunkIdForTouchRef = useRef<(id: number | null) => void>(() => {})

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

  speakExploreChunkIdForTouchRef.current = (id: number | null) => {
    if (!hoverTtsEnabledRef.current) return
    if (id == null) {
      hoverTtsLastSpokenIdRef.current = null
      cancelHoverSpeech()
      return
    }
    if (id === hoverTtsLastSpokenIdRef.current) return
    hoverTtsLastSpokenIdRef.current = id
    const data = itemsRef.current
    if (!data) return
    const text = articleChunkTextByNumericId(data, id)
    if (text) speakHoverChunk(text)
  }

  const { ref: touchSurfaceRef, touchExploring } = useChunkTouchExploration(
    commitExploringChunkId,
    items,
    pageKey,
    {
      onTouchPointerClient: (pt) => {
        tooltipFollowRef.current = pt
        if (pt) followTooltipPlaceRef.current?.(pt.x, pt.y)
      },
      onExploreChunkId: (id) => speakExploreChunkIdForTouchRef.current(id),
      onTouchExplorationStart: () => {
        if (chunkDetails.activeChunk != null) {
          chunkDetails.close()
          setPinnedChunkId(null)
          setMenuOnlyChunkId(null)
        }
        if (!hoverTtsEnabledRef.current) return
        speechUnlockForTouchGesture()
      },
      onBeforeTouchChunkIdChange: () => {
        if (!hoverTtsEnabledRef.current) return
        speechUnlockForTouchGesture()
      },
    },
  )

  useLayoutEffect(() => {
    const el = touchSurfaceRef.current
    if (!el) return

    const syncHoverTtsFromPointer = (clientX: number, clientY: number) => {
      if (!hoverTtsEnabledRef.current) return
      const data = itemsRef.current
      if (!data) return
      const nid = getChunkIdFromPointerClientXY(clientX, clientY, el)
      if (nid != null) {
        if (nid === hoverTtsLastSpokenIdRef.current) return
        hoverTtsLastSpokenIdRef.current = nid
        const text = articleChunkTextByNumericId(data, nid)
        if (text) speakHoverChunk(text)
      } else {
        hoverTtsLastSpokenIdRef.current = null
        cancelHoverSpeech()
      }
    }

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
      syncHoverTtsFromPointer(e.clientX, e.clientY)
      applyHit(e.clientX, e.clientY)
    }

    const onMouseMove = (e: MouseEvent) => {
      pointerPendingRef.current = { x: e.clientX, y: e.clientY }
      setTooltipPointer({ x: e.clientX, y: e.clientY })
      syncHoverTtsFromPointer(e.clientX, e.clientY)
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
      hoverTtsLastSpokenIdRef.current = null
      if (hoverTtsEnabledRef.current) cancelHoverSpeech()
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
  }, [pageKey, cancelExploringLeaveTimer])

  // Details box state (used below for effectivePopupId — keep highlight + tooltip while sheet is open)

  /** When the grammar sheet is open, keep the same chunk “active” even if hover exploration cleared. */
  const detailsAnchoredChunkId = useMemo(() => {
    const key = chunkDetails.activeChunk?.trim()
    if (!key || !items) return null
    let cid = 0
    for (const it of items) {
      if (it.type === "chapter" || it.type === "text") continue
      if (it.chunk === chunkDetails.activeChunk) return cid
      cid++
    }
    return null
  }, [chunkDetails.activeChunk, items])

  const effectivePopupId = useMemo(() => {
    const base =
      exploringChunkId != null
        ? exploringChunkId
        : pinnedChunkId != null
          ? pinnedChunkId
          : detailsAnchoredChunkId
    if (menuOnlyChunkId != null && base === menuOnlyChunkId) return null
    return base ?? null
  }, [exploringChunkId, pinnedChunkId, detailsAnchoredChunkId, menuOnlyChunkId])

  useEffect(() => {
    if (!hoverTtsEnabled) {
      hoverTtsLastSpokenIdRef.current = null
      cancelHoverSpeech()
    }
  }, [hoverTtsEnabled])

  const { pageEnterStyle } = useReadingPageEnterAnimation(pageKey)

  /** Replacing `key={pageKey}` remount — keep scroll at top per page without remounting (WebKit skips enter anim on fresh nodes). */
  useLayoutEffect(() => {
    const el = touchSurfaceRef.current
    if (el) el.scrollTop = 0
  }, [pageKey])

  /** Reconstruct full page text for LLM sentence context */
  const pageText = useMemo(() => {
    if (!items) return ""
    return items
      .map((item) =>
        item.type === "text"
          ? item.text
          : item.type === "chapter"
            ? `${item.label}\n`
            : item.chunk,
      )
      .join("")
  }, [items])

  const handleGlobalClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-app-error-modal]")) return
    if (
      !target.closest("[data-chunk]") &&
      !target.closest("[data-popup]") &&
      !target.closest("[data-details-box]")
    ) {
      cancelExploringLeaveTimer()
      setTooltipPointer(null)
      setExploringChunkId(null)
      setPinnedChunkId(null)
      setMenuOnlyChunkId(null)
      chunkDetails.close()
    }
  }, [chunkDetails, cancelExploringLeaveTimer])

  const handleDetailsClose = useCallback(() => {
    setMenuOnlyChunkId(null)
    chunkDetails.close()
  }, [chunkDetails])

  useEffect(() => {
    document.addEventListener("click", handleGlobalClick)
    return () => document.removeEventListener("click", handleGlobalClick)
  }, [handleGlobalClick])

  let chunkId = 0

  const showTranslationErrorModal =
    Boolean(errorMessage && !loading && !errorModalDismissed)

  const translationErrPresent = useMemo(
    () => (errorMessage ? translationErrorForUserModal(errorMessage) : null),
    [errorMessage],
  )

  return (
    <>
    <div
      className={cn(
        "w-full mx-auto px-6 md:px-8 md:pt-24 pb-10 md:pb-16",
        pagination && pagination.pageCount > 1
          ? "max-md:pb-[max(5.5rem,env(safe-area-inset-bottom,0px)+4.5rem)]"
          : "max-md:pb-[max(2.5rem,env(safe-area-inset-bottom,0px)+1.5rem)]",
        "max-md:pt-[calc(env(safe-area-inset-top,0px)+5.75rem)]",
        "flex w-full flex-1 flex-col min-h-0 max-md:overflow-hidden",
        "md:min-h-[calc(100dvh-7.25rem)]",
      )}
      style={{
        maxWidth: "700px",
        ["--reading-content-top" as string]: `${READING_CONTENT_TOP_MOBILE_REM}rem`,
      }}
    >
      <article
        ref={touchSurfaceRef}
        style={pageEnterStyle}
        className={cn(
          "font-reading text-[1.5625rem] md:text-[1.725rem] leading-[1.75] md:leading-[1.85] text-foreground selection:bg-primary/20 indent-5 md:indent-7",
          "min-h-0 flex-1 md:mb-8 max-md:overflow-y-auto max-md:overscroll-y-contain",
          touchExploring && "touch-none select-none",
        )}
      >
        {loading && (
          <div className="text-muted-foreground">
            <span className="translating-page-gradient">Translating this page…</span>
          </div>
        )}
        {!loading && !errorMessage && items && (
          <>
            {items.map((item, i) => {
              if (item.type === "text") {
                return <span key={i}>{item.text}</span>
              }
              if (item.type === "chapter") {
                return (
                  <div
                    key={i}
                    className="my-8 block w-full indent-0 text-center font-reading text-2xl font-medium tabular-nums tracking-[0.18em] text-muted-foreground md:text-3xl"
                    role="separator"
                    aria-label={`Chapter ${item.label}`}
                  >
                    {item.label}
                  </div>
                )
              }
              const prev = i > 0 ? items[i - 1] : null
              const gap =
                prev?.type === "chunk" && item.type === "chunk"
                  ? gapBetweenReconciledChunks(prev, item)
                  : ""
              const id = chunkId++
              const chunkData = {
                id,
                text: item.chunk,
                meaning: item.meaning,
                literal: item.literal,
                grammar: item.note,
              }
              return (
                <span key={i}>
                  {gap ? <span aria-hidden="true">{gap}</span> : null}
                  <TextChunk
                    variant="article"
                    chunk={chunkData}
                    popupChunkId={effectivePopupId}
                    delegatePointerHover
                    followPointerRef={
                      touchExploring && effectivePopupId === id
                        ? tooltipFollowRef
                        : undefined
                    }
                    followPointerPlaceRef={
                      touchExploring && effectivePopupId === id
                        ? followTooltipPlaceRef
                        : undefined
                    }
                    followPointerClient={
                      !touchExploring &&
                      effectivePopupId === id &&
                      tooltipPointer != null
                        ? tooltipPointer
                        : null
                    }
                    isTouchHighlight={
                      exploringChunkId === id ||
                      (chunkDetails.activeChunk != null && chunkDetails.activeChunk === item.chunk)
                    }
                    isPinned={pinnedChunkId === id}
                    onActivate={() => commitExploringChunkId(id)}
                    onDeactivate={() => {
                      if (pinnedChunkId !== id) scheduleExploringLeave()
                    }}
                    onPinToggle={() => setPinnedChunkId(prev => (prev === id ? null : id))}
                    onRequestDetails={() => {
                      if (chunkDetails.activeChunk != null) {
                        chunkDetails.close()
                        setMenuOnlyChunkId(null)
                        return
                      }
                      commitExploringChunkId(null)
                      setPinnedChunkId(null)
                      setMenuOnlyChunkId(id)
                      chunkDetails.fetchDetails(item.chunk, pageText)
                    }}
                    onDoubleClickMenuOnly={() => {
                      setExploringChunkId(null)
                      setPinnedChunkId(null)
                      setMenuOnlyChunkId(id)
                    }}
                  />
                </span>
              )
            })}
          </>
        )}
      </article>

      {pagination && pagination.pageCount > 1 && (
        <footer className={cn(
          "flex items-center justify-between gap-4",
          // Desktop: in-flow, pushed to bottom by mt-auto
          "mt-auto shrink-0 border-t border-border/60 pt-1",
          // Mobile: fixed to screen bottom, always visible
          "max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-30",
          "max-md:mt-0 max-md:border-t max-md:border-border/40 max-md:bg-background",
          "max-md:px-8 max-md:pt-3 max-md:pb-[max(1.25rem,env(safe-area-inset-bottom,0px)+0.5rem)]",
        )}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            disabled={pagination.pageIndex <= 0}
            onClick={pagination.onPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <span className="text-sm font-sans text-muted-foreground tabular-nums">
            Page {pagination.pageIndex + 1} of {pagination.pageCount}
          </span>
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled={
                pagination.pageIndex >= pagination.pageCount - 1 || !pagination.nextPageOpen
              }
              onClick={pagination.onNext}
              aria-label="Next page"
            >
              {pagination.nextPageLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
              ) : (
                <ChevronRight className="h-6 w-6" />
              )}
            </Button>
          </div>
        </footer>
      )}

      {pagination && pagination.pageCount > 1 && (
        <MobileReadingEdgeTurn
          enabled
          canGoPrevious={pagination.pageIndex > 0}
          canGoNext={
            pagination.pageIndex < pagination.pageCount - 1 && pagination.nextPageOpen
          }
          onPrevious={pagination.onPrevious}
          onNext={pagination.onNext}
        />
      )}

      <DetailsBox
        activeChunk={chunkDetails.activeChunk}
        detail={chunkDetails.detail}
        loading={chunkDetails.loading}
        error={chunkDetails.error}
        onClose={handleDetailsClose}
      />
    </div>
    {showTranslationErrorModal && translationErrPresent && (
      <AppErrorModal
        title="Translation failed"
        message={translationErrPresent.userMessage}
        devOnlyTechnicalDetail={translationErrPresent.devTechnical}
        onDismiss={() => setErrorModalDismissed(true)}
        onRetry={() => {
          setErrorModalDismissed(true)
          onRetry?.()
        }}
        retryLabel="Retry translation"
      />
    )}
    {import.meta.env.DEV &&
      DevArticleMachineTranslate != null &&
      items &&
      pageText.trim() && (
        <Suspense fallback={null}>
          <DevArticleMachineTranslate pageText={pageText} disabled={loading} />
        </Suspense>
      )}
    </>
  )
}
