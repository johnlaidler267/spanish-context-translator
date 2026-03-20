"use client"

import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * Keeps --app-vh in sync with the *visible* viewport (visualViewport when available).
 * Fixes stale 100vh / locked heights when browser chrome or keyboard changes size.
 */
export function ViewportSync() {
  const { pathname } = useLocation()

  useEffect(() => {
    const set = () => {
      const vv = window.visualViewport
      const h = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty("--app-vh", `${h}px`)
    }

    set()
    const vv = window.visualViewport
    vv?.addEventListener("resize", set)
    vv?.addEventListener("scroll", set)
    window.addEventListener("resize", set)
    window.addEventListener("orientationchange", set)
    const onVis = () => {
      if (document.visibilityState === "visible") set()
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      vv?.removeEventListener("resize", set)
      vv?.removeEventListener("scroll", set)
      window.removeEventListener("resize", set)
      window.removeEventListener("orientationchange", set)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  useEffect(() => {
    const set = () => {
      const vv = window.visualViewport
      const h = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty("--app-vh", `${h}px`)
    }
    requestAnimationFrame(set)
  }, [pathname])

  return null
}
