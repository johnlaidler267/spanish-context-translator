import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react"

/**
 * One-shot enter animation when an article/read page index changes (not on first mount).
 */
export function useReadingPageEnterAnimation(pageKey: number) {
  const prevRef = useRef<number | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== pageKey) {
      setActive(true)
    }
    prevRef.current = pageKey
  }, [pageKey])

  const onPageEnterAnimationEnd = useCallback((e: AnimationEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) setActive(false)
  }, [])

  return {
    pageEnterClassName: active ? "animate-reading-page-enter" : "",
    onPageEnterAnimationEnd,
  }
}
