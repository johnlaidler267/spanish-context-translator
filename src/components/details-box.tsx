"use client"

/**
 * DetailsBox — fixed bottom sheet that shows grammar details for a clicked chunk.
 *
 * Portals to `document.body` so `position:fixed` isn’t warped by a transformed
 * ancestor (e.g. reading shell `animate-fade-in-up`). Unmounts when closed so
 * no empty shell sits off-screen on mobile.
 */

import { createPortal } from "react-dom"
import { X, BookOpen, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type DetailState } from "@/hooks/use-chunk-details"

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
  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      data-details-box
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[70]",
        "translate-y-0",
        className,
      )}
    >
      {/* backdrop blur strip */}
      <div
        className={cn(
          "mx-auto max-w-[700px] rounded-t-xl",
          "bg-[#f9f5ef] dark:bg-[#1e1b18]",
          "border border-b-0 border-[rgba(201,122,90,0.22)] dark:border-[rgba(201,122,90,0.15)]",
          "shadow-[0_-4px_24px_rgba(0,0,0,0.10)]",
        )}
      >
        {/* Header: leading-snug (avoids descender clip) + slight -translate-y vs book icon */}
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

        {/* Content */}
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
    </div>,
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
