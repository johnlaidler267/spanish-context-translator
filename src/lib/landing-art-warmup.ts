import { getStoredReadingTheme } from "@/lib/storage/theme-storage"
import { MOBILE_MEDIA_QUERY } from "@/contexts/viewport-context"

/**
 * Landing page artwork first-paint warm-up, started before React mounts (see main.jsx).
 *
 * The landing page used to paint as soon as auth and the subscription check cleared the
 * loading bar, and its background art and (mobile) hero illustration then popped in a beat
 * later while an older phone fetched and decoded them. Starting both here and holding the
 * loading bar until they're decoded (App.tsx) makes the page appear complete in one step.
 *
 * Capped at MAX_WAIT_MS: decoration must never be what strands a reader on the loading bar
 * over a slow connection -- past that the page shows and the art fills in when it arrives.
 */
const MAX_WAIT_MS = 1200

let ready: Promise<void> | null = null
let settled = false
// Held so the decoded images stay referenced (and in the browser's memory cache) until the
// page's own <img>s ask for the same URLs.
const warmed: HTMLImageElement[] = []

export function warmLandingArtFirstPaint(): void {
  if (ready || typeof window === "undefined") return
  const sources = [getStoredReadingTheme() === "dark" ? "/landing-bg-dark.webp" : "/landing-bg.webp"]
  // The hero illustration is md:hidden -- only mobile renders it (see landing-screen.tsx).
  if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) sources.push("/landing-hero-books.webp")
  const decoded = sources.map((src) => {
    const img = new Image()
    img.src = src
    warmed.push(img)
    return img.decode().catch(() => undefined)
  })
  const cap = new Promise<void>((resolve) => setTimeout(resolve, MAX_WAIT_MS))
  ready = Promise.race([Promise.all(decoded).then(() => undefined), cap]).then(() => {
    settled = true
  })
}

/** True once the art is decoded (or the cap passed), or when no warm-up was started. */
export function isLandingArtReady(): boolean {
  return ready === null || settled
}

export function whenLandingArtReady(): Promise<void> {
  return ready ?? Promise.resolve()
}
