import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react"

/**
 * Matches Tailwind's `md:` breakpoint, which is what the Continue Reading rows used to be
 * switched by in CSS. Keep the two in sync: this context now decides which row is *rendered*,
 * so a mismatch here shows the wrong layout rather than just styling it oddly.
 */
const MOBILE_MEDIA_QUERY = "(max-width: 767.98px)"

interface ViewportContextType {
  isMobile: boolean
}

export const ViewportContext = createContext<ViewportContextType | null>(null)

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

/**
 * `useSyncExternalStore` rather than state seeded before mount, for two reasons the earlier
 * approach got wrong:
 *
 *  - The very first render reads the real match synchronously, so there is no default-then-
 *    correct flip and no first-paint flicker (the thing 9ef3330 fixed and this must not undo).
 *  - It stays subscribed, so rotating a phone or dragging a desktop window across the
 *    breakpoint re-renders with the right row. A value captured once at module load silently
 *    kept showing the wrong layout until a full reload — which is what CSS used to handle for
 *    free, and what any JS replacement has to keep handling.
 */
export function ViewportProvider({ children }: { children: ReactNode }) {
  const isMobile = useSyncExternalStore(subscribe, getSnapshot, () => false)
  // Object identity changes only when isMobile does, so consumers don't re-render on every
  // parent render.
  return (
    <ViewportContext.Provider value={isMobile ? MOBILE_VALUE : DESKTOP_VALUE}>
      {children}
    </ViewportContext.Provider>
  )
}

const MOBILE_VALUE: ViewportContextType = { isMobile: true }
const DESKTOP_VALUE: ViewportContextType = { isMobile: false }

export function useViewport(): ViewportContextType {
  const context = useContext(ViewportContext)
  if (!context) {
    throw new Error("useViewport must be used within ViewportProvider")
  }
  return context
}
