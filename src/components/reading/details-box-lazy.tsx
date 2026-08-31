"use client"

/**
 * Lazy wrapper around DetailsBox — it pulls in framer-motion, which is only
 * needed once a user actually taps a word. Deferring it keeps that weight
 * out of the initial reading-flow bundle.
 */

import { lazy, Suspense } from "react"
import type { DetailsBoxProps } from "@/components/reading/details-box"

const DetailsBox = lazy(() =>
  import("@/components/reading/details-box").then((m) => ({ default: m.DetailsBox })),
)

export function DetailsBoxLazy(props: DetailsBoxProps) {
  // No visible fallback: the box only ever renders once activeChunk is set
  // (i.e. after the user has already triggered the interaction), so a null
  // fallback just means the popup itself appears a beat later.
  return (
    <Suspense fallback={null}>
      <DetailsBox {...props} />
    </Suspense>
  )
}
