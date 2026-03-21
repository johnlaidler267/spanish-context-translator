"use client"

import { useNavigate } from "react-router-dom"

type Props = {
  className?: string
  children: React.ReactNode
}

/** Link to `/` with View Transitions API when available (smoother handoff on mobile). */
export function BackToHomeLink({ className, children }: Props) {
  const navigate = useNavigate()

  return (
    <a
      href="/"
      className={className}
      onClick={(e) => {
        e.preventDefault()
        const go = () => {
          navigate("/")
        }
        const doc = document as Document & {
          startViewTransition?: (cb: () => void) => unknown
        }
        if (typeof doc.startViewTransition === "function") {
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
