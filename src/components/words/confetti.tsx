import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"

const COLORS = ["#c97a5a", "#3e5a8c", "#e2b04a", "#5f9e7a", "#d98ba0"]
const PIECES = 44

type Piece = { x: number; drift: number; delay: number; spin: number; size: number; color: string; round: boolean }

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    x: Math.random() * 100,
    drift: (Math.random() - 0.5) * 160,
    delay: Math.random() * 0.35,
    spin: (Math.random() - 0.5) * 900,
    size: 6 + Math.random() * 6,
    color: COLORS[i % COLORS.length],
    round: Math.random() < 0.3,
  }))
}

/** A one-off burst of confetti falling over the page. Renders nothing for reduced-motion users. */
export function Confetti() {
  const reduceMotion = useReducedMotion()
  const [pieces] = useState(makePieces)
  if (reduceMotion) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden" data-testid="confetti">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            backgroundColor: p.color,
            borderRadius: p.round ? "9999px" : "1px",
          }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", x: p.drift, rotate: p.spin, opacity: [1, 1, 0] }}
          transition={{ duration: 2.2 + p.delay * 2, delay: p.delay, ease: [0.25, 0.6, 0.45, 1] }}
        />
      ))}
    </div>
  )
}
