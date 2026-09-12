import { lazy, type ComponentType, type LazyExoticComponent } from "react"

/** A lazy route that can also be asked to fetch its chunk ahead of navigation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own signature
export type PreloadableRoute<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  /**
   * Starts downloading this route's chunk without rendering it. Safe to call repeatedly --
   * the underlying dynamic import is memoized by the bundler, so extra calls are free.
   *
   * Route chunks are the part of a page the data cache can't help with: until the chunk
   * arrives there is no component to paint the cached data *into*, so the router sits on its
   * Suspense spinner. On a phone that download is the single longest step in opening Discover,
   * which is why the catalog cache alone still left a blank beat there.
   */
  preload: () => Promise<unknown>
}

/**
 * Only set once we're actually recovering from a failed chunk fetch — never on a
 * normal first load — so a genuinely broken/offline chunk still surfaces as a real
 * error after one retry instead of reload-looping forever.
 */
const RELOAD_ONCE_KEY = "lector.route-chunk-reload-attempted"

function isStaleChunkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /fetch dynamically imported module|error loading dynamically imported module/i.test(
    message,
  )
}

function hasReloadedOnceThisSession(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_ONCE_KEY) === "1"
  } catch {
    return false
  }
}

function markReloadedOnceThisSession() {
  try {
    sessionStorage.setItem(RELOAD_ONCE_KEY, "1")
  } catch {
    /* private mode / storage disabled — worst case we skip the auto-recovery below */
  }
}

function clearReloadMark() {
  try {
    sessionStorage.removeItem(RELOAD_ONCE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * `React.lazy` for route-level code splitting, with recovery from stale-deploy chunk
 * failures. Every deploy replaces the built JS/CSS with new content-hashed filenames;
 * a tab left open from before a deploy still runs old code that points at those now-
 * deleted filenames. This app's SPA rewrite (vercel.json) serves index.html (200,
 * text/html) for any unmatched path, including a missing asset — the browser's module
 * MIME check then rejects it and throws "Failed to fetch dynamically imported module",
 * which used to be an unrecoverable crash into the top-level error boundary the moment
 * someone navigated to a lazy-loaded route (e.g. Discover) after any deploy landed.
 *
 * On that specific failure, reload once to pick up the current index.html (and
 * therefore the current chunk hashes) so the navigation just resumes — the user never
 * sees an error. A second failure in the same tab session is treated as real and
 * thrown normally, so the error boundary still catches genuine problems.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own signature
export function lazyRoute<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): PreloadableRoute<T> {
  const load = async () => {
    try {
      const mod = await importer()
      clearReloadMark()
      return mod
    } catch (err) {
      if (isStaleChunkError(err) && !hasReloadedOnceThisSession()) {
        markReloadedOnceThisSession()
        window.location.reload()
        // Reload is already in flight — never resolve, so React just keeps showing
        // the route's Suspense fallback until the page navigates away underneath it.
        return new Promise<{ default: T }>(() => {})
      }
      throw err
    }
  }
  const Route = lazy(load) as PreloadableRoute<T>
  // Swallowed here rather than surfaced: a preload is an optimization, and a chunk that fails
  // to arrive early still gets a real attempt (and real error handling) when the user actually
  // navigates and React renders the lazy component.
  Route.preload = () => load().catch(() => undefined)
  return Route
}
