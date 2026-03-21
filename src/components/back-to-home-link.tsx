"use client"

import { useNavigate } from "react-router-dom"
import { beginRouteTransition } from "@/lib/route-transition-shell"

type Props = {
  className?: string
  children: React.ReactNode
}

const MOBILE_MQ = "(max-width: 767px)"

/** Link to `/` — unlocks overflow for transitions on mobile; VT only on desktop (avoids double-layer glitches). */
export function BackToHomeLink({ className, children }: Props) {
  const navigate = useNavigate()

  return (
    <a
      href="/"
      className={className}
      onClick={(e) => {
        e.preventDefault()
        beginRouteTransition(560)

        const go = () => {
          navigate("/")
        }
        const doc = document as Document & {
          startViewTransition?: (cb: () => void) => { finished: Promise<void> }
        }
        const isMobile = typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches
        if (!isMobile && typeof doc.startViewTransition === "function") {
          doc.startViewTransition(go)
        } else {
          go()
        }
      }}
    >
      {children}
    </a>
  )
}
