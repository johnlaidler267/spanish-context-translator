"use client"

/**
 * DetailsBox — fixed bottom sheet that shows grammar details for a clicked chunk.
 *
 * Renders when `activeChunk` is non-null. Slides up from the bottom.
 * Close via the × button or by clicking a different chunk (parent controls state).
 */

import { X, BookOpen, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type DetailState, groupFormsByInfinitive } from "@/hooks/use-chunk-details"

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
  const visible = activeChunk != null

  return (
    <div
      data-details-box
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[70]",
        "transition-transform duration-300 ease-out",
        visible ? "translate-y-0" : "translate-y-full",
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
        {/* Header row */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#c97a5a] opacity-80" aria-hidden />
          <span
            className="flex-1 min-w-0 font-serif text-lg leading-snug text-foreground truncate"
            title={activeChunk ?? ""}
          >
            {activeChunk}
          </span>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
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
    </div>
  )
}

// ─── Detail content renderers ─────────────────────────────────────────────────

function DetailContent({ detail }: { detail: DetailState }) {
  if (detail.type === "llm") {
    return (
      <p className="text-sm font-sans text-foreground/85 leading-relaxed">
        {detail.text}
      </p>
    )
  }

  const { data } = detail

  // Particle / phrase
  if (data.kind === "particle" || data.kind === "phrase") {
    return (
      <div className="space-y-1">
        <span className="inline-block text-[0.6rem] uppercase tracking-widest text-muted-foreground font-sans">
          {data.kind === "phrase" ? "Expression" : "Function word"}
        </span>
        <p className="text-sm font-sans text-foreground/85 leading-relaxed">{data.note}</p>
      </div>
    )
  }

  // Verb form(s)
  if (data.kind === "verb" && data.forms && data.forms.length > 0) {
    const grouped = groupFormsByInfinitive(data.forms)

    return (
      <div className="space-y-3">
        {[...grouped.entries()].map(([infinitive, forms]) => {
          // Show the most specific / useful form first (unique tense + person combos)
          const uniqueForms = forms.filter(
            (f, i, a) => a.findIndex(x => x.tense === f.tense && x.person === f.person) === i,
          )

          return (
            <div key={infinitive}>
              {/* Infinitive label */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground font-sans">
                  verb
                </span>
                <span className="text-[0.6rem] text-[rgba(201,122,90,0.6)] font-sans">·</span>
                <span className="text-xs font-serif font-semibold text-[#c97a5a]">
                  {infinitive}
                </span>
              </div>

              {/* Tense rows */}
              <div className="space-y-1">
                {uniqueForms.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-sm font-sans">
                    <span className="text-foreground/85 leading-snug">{f.tense}</span>
                    {f.person !== "non-finite" && (
                      <>
                        <span className="text-muted-foreground/50 text-[0.65rem]">·</span>
                        <span className="text-muted-foreground text-xs">{f.person}</span>
                      </>
                    )}
                  </div>
                ))}
                {uniqueForms.length > 3 && (
                  <p className="text-xs text-muted-foreground font-sans">
                    +{uniqueForms.length - 3} more form{uniqueForms.length - 3 !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return null
}
