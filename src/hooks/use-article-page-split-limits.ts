import { useEffect, useState } from "react"
import type { PageSplitLimits } from "@/lib/translate"
import { resolvePageSplitLimits } from "@/lib/translate"
import { measureArticlePageSplitLimitsWhenReady } from "@/lib/reading-page-measure"

function viewportIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

/**
 * Cached {@link PageSplitLimits} from a hidden probe matching article reader typography.
 * Recomputed on resize / mobile breakpoint change (and after fonts load).
 */
export function useArticlePageSplitLimits(): PageSplitLimits {
  const [limits, setLimits] = useState<PageSplitLimits | null>(null)

  useEffect(() => {
    let cancelled = false

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

    return () => {
      cancelled = true
      mq.removeEventListener("change", onLayout)
      window.removeEventListener("resize", onLayout)
    }
  }, [])

  return limits ?? resolvePageSplitLimits(viewportIsMobile())
}
