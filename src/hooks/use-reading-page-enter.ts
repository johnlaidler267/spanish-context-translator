import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"

/** Clear inline animation after keyframes finish (ms) */
const PAGE_ENTER_CLEAR_MS = 320

/**
 * One-shot enter when the supplied key changes (e.g. article `pageKey` or read-mode
 * `readStepOffset + currentSentenceIndex`). Skipped on first mount.
 * useLayoutEffect turns the animation on before paint — useEffect runs too late and
 * the browser often never starts keyframes on the first painted frame.
 * Inline `animation` avoids Tailwind/preflight overriding a class.
 */
export function useReadingPageEnterAnimation(pageKey: number) {
  const prevRef = useRef<number | null>(null)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => {
    const previous = prevRef.current
    prevRef.current = pageKey
    if (previous !== null && previous !== pageKey) {
      setActive(true)
    }
  }, [pageKey])

  useEffect(() => {
    if (!active) return
    const tid = window.setTimeout(() => setActive(false), PAGE_ENTER_CLEAR_MS)
    return () => window.clearTimeout(tid)
  }, [active, pageKey])

  const pageEnterStyle: CSSProperties | undefined = active
    ? {
        animation: "reading-page-enter 260ms cubic-bezier(0.22, 1, 0.36, 1) both",
      }
    : undefined

  return { pageEnterStyle }
}
