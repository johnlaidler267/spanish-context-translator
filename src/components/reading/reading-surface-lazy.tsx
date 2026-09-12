"use client"

/**
 * Lazy handles for the reading screen's components (see reading-surface.tsx).
 *
 * These used to be static imports in App.tsx, which meant the article renderer, read
 * mode, the per-word chunk machinery and the reading toolbar were all parsed and
 * executed as part of the main bundle — before the landing page could paint — even
 * though a reader can't reach any of them without first submitting text or opening a
 * book. Splitting them out takes that work off the landing page's critical path.
 *
 * They all resolve from the same module, so the four `lazyRoute` calls below share one
 * chunk and one download: whichever loads first satisfies the rest. `lazyRoute` (rather
 * than React.lazy directly) so a tab left open across a deploy recovers from a stale
 * chunk reference instead of crashing into the error boundary — see its docstring.
 */

import { lazyRoute } from "@/lib/lazy-route"

const loadReadingSurface = () => import("@/components/reading/reading-surface")

export const ReadingHeader = lazyRoute(() =>
  loadReadingSurface().then((m) => ({ default: m.ReadingHeader })),
)
export const ArticleContent = lazyRoute(() =>
  loadReadingSurface().then((m) => ({ default: m.ArticleContent })),
)
export const ReadMode = lazyRoute(() => loadReadingSurface().then((m) => ({ default: m.ReadMode })))
export const WhereYouLeftOffModal = lazyRoute(() =>
  loadReadingSurface().then((m) => ({ default: m.WhereYouLeftOffModal })),
)

/**
 * Starts downloading the reading chunk without rendering it. The reading screen is only
 * ever entered after an LLM round trip the loading overlay is already covering, so calling
 * this the moment a translation starts means the chunk is in cache well before there's
 * anything to render — the split costs no visible delay. Safe to call repeatedly; the
 * dynamic import is memoized by the bundler.
 */
export function preloadReadingSurface(): Promise<unknown> {
  return ReadingHeader.preload()
}
