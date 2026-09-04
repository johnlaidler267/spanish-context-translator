import { useEffect, useState } from "react"
import type { PageSplitLimits } from "@/lib/translate"
import { resolvePageSplitLimits } from "@/lib/translate"
import { measureArticlePageSplitLimitsWhenReady } from "@/lib/reading/reading-page-measure"

function viewportIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

/** Settle delay (ms) after a `visualViewport` resize before re-measuring — the keyboard/toolbar
 * animation is still moving for a bit after the first event fires, so measuring immediately would
 * just cache another transient (wrong) height. */
const VISUAL_VIEWPORT_SETTLE_MS = 200

/**
 * Cached {@link PageSplitLimits} from a hidden probe matching article reader typography.
 * Recomputed on resize / mobile breakpoint change (and after fonts load).
 *
 * Also recomputed on `visualViewport` resize (debounced): on iOS Safari, the on-screen keyboard
 * opening/closing and the dynamic toolbar collapsing change `visualViewport.height` without firing
 * `window`'s own `resize` event (the same quirk `useVirtualKeyboardLayoutFix` works around for
 * scroll position). Article text is typically submitted right after typing in the landing
 * textarea — i.e. right after the keyboard closes — so without this, the cached limits here can
 * reflect a stale (keyboard-open or toolbar-visible) viewport height for the rest of the reading
 * session: `sourcePages` in App.tsx is built once from whatever this hook returns at submit time,
 * so a stale, over-generous height here means a page's actual rendered content can run past what
 * the settled viewport shows, with no later recompute to fix it.
 */
export function useArticlePageSplitLimits(): PageSplitLimits {
  const [limits, setLimits] = useState<PageSplitLimits | null>(null)

  useEffect(() => {
    let cancelled = false
    let settleTimer: number | null = null

    const run = async () => {
      const isMobile = viewportIsMobile()
      const next = await measureArticlePageSplitLimitsWhenReady(isMobile)
      if (!cancelled) setLimits(next)
    }

    void run()

    const mq = window.matchMedia("(max-width: 767px)")
    const onLayout = () => void run()
    mq.addEventListener("change", onLayout)
    window.addEventListener("resize", onLayout)

    const vv = window.visualViewport
    const onVisualViewportResize = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = null
        void run()
      }, VISUAL_VIEWPORT_SETTLE_MS)
    }
    vv?.addEventListener("resize", onVisualViewportResize)

    return () => {
      cancelled = true
      if (settleTimer != null) window.clearTimeout(settleTimer)
      mq.removeEventListener("change", onLayout)
      window.removeEventListener("resize", onLayout)
      vv?.removeEventListener("resize", onVisualViewportResize)
    }
  }, [])

  return limits ?? resolvePageSplitLimits(viewportIsMobile())
}
