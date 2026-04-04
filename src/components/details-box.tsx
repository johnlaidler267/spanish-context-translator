"use client"

/**
 * DetailsBox — fixed bottom sheet that shows grammar details for a clicked chunk.
 *
 * Portals to `document.body` so `position:fixed` isn’t warped by a transformed
 * ancestor (e.g. reading shell `animate-fade-in-up`). Enter/exit use Framer
 * Motion so the sheet unmounts only after the dismiss animation finishes.
 */

import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X, BookOpen, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type DetailState } from "@/hooks/use-chunk-details"

/** Deceleration — quick start, soft settle (supplementary UI, not a drawer). */
const EASE_OUT_DECEL: [number, number, number, number] = [0.22, 1, 0.36, 1]
/** Ease-in — dismiss feels like “throw away” vs “set down”. */
const EASE_IN_DISMISS: [number, number, number, number] = [0.42, 0, 1, 1]

const DURATION_IN_S = 0.24
const DURATION_OUT_S = 0.18
const SLIDE_IN_PX = 14
const SLIDE_OUT_PX = 12

interface DetailsBoxProps {
  activeChunk: string | null
  detail:      DetailState | null
  loading:     boolean
  error:       string | null
  onClose:     () => void
  className?:  string
}

export function DetailsBox({
  activeChunk,
  detail,
  loading,
  error,
  onClose,
  className,
}: DetailsBoxProps) {
  const open = Boolean(activeChunk?.trim())
  const reduceMotion = useReducedMotion()

  const enter =
    reduceMotion
      ? { duration: 0 }
      : { duration: DURATION_IN_S, ease: EASE_OUT_DECEL }
  const exitOnly =
    reduceMotion
      ? { duration: 0 }
      : { duration: DURATION_OUT_S, ease: EASE_IN_DISMISS }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.button
          key="details-scrim"
          data-details-box
          type="button"
          aria-label="Dismiss details"
          className={cn(
            "fixed inset-0 z-[70] border-0 p-0 cursor-default",
            /* Solid rgba — avoids Tailwind /opacity + animated opacity double-multiply flicker on iOS */
            "bg-[rgba(0,0,0,0.18)] dark:bg-[rgba(0,0,0,0.45)]",
            "[-webkit-backface-visibility:hidden] [backface-visibility:hidden]",
          )}
          /* No enter fade: one less full-screen opacity tween (fixes scrim flicker with scroll/freezing assists). */
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitOnly }}
          onClick={onClose}
        />
      )}
      {open && (
        <motion.div
          key="details-sheet"
          data-details-box
          className={cn(
            "fixed bottom-0 left-0 right-0 z-[71] flex justify-center pointer-events-none",
            "[-webkit-backface-visibility:hidden] [backface-visibility:hidden]",
            className,
          )}
          initial={{ opacity: 0, y: SLIDE_IN_PX }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: SLIDE_OUT_PX,
            transition: exitOnly,
          }}
          transition={enter}
        >
          <div
            className={cn(
              "pointer-events-auto w-full max-w-[700px] rounded-t-xl",
              "bg-[#f9f5ef] dark:bg-[#1e1b18]",
              "border border-b-0 border-[rgba(201,122,90,0.22)] dark:border-[rgba(201,122,90,0.15)]",
              "shadow-[0_-4px_24px_rgba(0,0,0,0.10)]",
            )}
          >
            <div className="flex items-center gap-3 px-5 pt-4 pb-3">
              <BookOpen className="h-4 w-4 shrink-0 text-[#c97a5a] opacity-80 block" aria-hidden />
              <span
                className="flex-1 min-w-0 font-serif text-lg leading-snug text-foreground truncate -translate-y-[3px]"
                title={activeChunk ?? ""}
              >
                {activeChunk}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4 block" />
              </button>
            </div>

            <div className="px-5 pb-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] min-h-[3.5rem]">
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm font-sans">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  <span>Looking up…</span>
                </div>
              )}

              {error && !loading && (
                <p className="text-sm font-sans text-muted-foreground italic">{error}</p>
              )}

              {detail && !loading && !error && (
                <DetailContent detail={detail} />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ─── Detail content renderers ─────────────────────────────────────────────────

function DetailContent({ detail }: { detail: DetailState }) {
  if (detail.type === "llm_verb") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground font-sans leading-snug">
            verb
          </span>
          <span className="text-[0.65rem] text-[rgba(201,122,90,0.6)] font-sans leading-snug" aria-hidden>
            ·
          </span>
          <span className="text-xs font-serif font-semibold text-[#c97a5a] leading-snug -translate-y-[2px]">
            {detail.infinitive}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-sans">
          <span className="text-foreground/85 leading-snug">{detail.tense}</span>
          {detail.person !== "—" && (
            <>
              <span className="text-muted-foreground/50 text-[0.65rem]">·</span>
              <span className="text-muted-foreground text-xs">{detail.person}</span>
            </>
          )}
        </div>
        {detail.contextNote && (
          <p className="text-sm font-sans text-foreground/85 leading-relaxed pt-0.5">
            {detail.contextNote}
          </p>
        )}
      </div>
    )
  }

  return (
    <p className="text-sm font-sans text-foreground/85 leading-relaxed">
      {detail.text}
    </p>
  )
}
