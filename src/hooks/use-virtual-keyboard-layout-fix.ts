import { type RefObject, useEffect } from "react"

const MOBILE_MQ = "(max-width: 767px)"

/**
 * Mobile browsers (esp. iOS Safari) often leave a dead gap at the bottom after the
 * virtual keyboard closes, while `100dvh` / overflow chains catch up.
 * Reset window scroll when the visual viewport grows again (keyboard dismissed).
 */
export function useVirtualKeyboardLayoutFix(scrollRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(MOBILE_MQ)
    if (!mq.matches) return

    const vv = window.visualViewport
    if (!vv) return

    let prevHeight = vv.height

    const resetDocumentScroll = () => {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      const root = document.getElementById("root")
      if (root instanceof HTMLElement && root.scrollTop) root.scrollTop = 0
    }

    const nudge = () => {
      resetDocumentScroll()
      const col = scrollRef.current
      if (col && col.scrollTop < 160) {
        col.scrollTop = 0
      }
      requestAnimationFrame(() => {
        resetDocumentScroll()
        requestAnimationFrame(resetDocumentScroll)
      })
    }

    const onResize = () => {
      const h = vv.height
      if (h > prevHeight + 40) {
        nudge()
      }
      prevHeight = h
    }

    vv.addEventListener("resize", onResize)
    return () => vv.removeEventListener("resize", onResize)
  }, [scrollRef])
}
