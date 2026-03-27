"use client"

import { useState, useEffect } from "react"

const MESSAGES = [
  "Analyzing your text…",
  "Reading for context…",
  "Translating…",
  "Almost there…",
]

export function LoadingOverlay() {
  const [msgIndex, setMsgIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  // Cycle through messages every ~3s
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setMsgIndex(i => Math.min(i + 1, MESSAGES.length - 1))
        setVisible(true)
      }, 250)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 w-48">

        {/* Bouncing dots */}
        <div className="flex items-center justify-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" />
        </div>

        {/* Progress bar */}
        <div className="w-full h-[2px] rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full bg-primary animate-progress-fill" />
        </div>

        {/* Cycling label */}
        <p
          className="text-muted-foreground font-sans text-xs tracking-wide transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {MESSAGES[msgIndex]}
        </p>

      </div>
    </div>
  )
}
