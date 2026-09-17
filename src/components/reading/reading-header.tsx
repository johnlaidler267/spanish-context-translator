"use client"

import { Link } from "react-router-dom"
import { ChevronLeft, Moon, Sun, Settings2, Volume2, VolumeX, Sparkles } from "lucide-react"
import { ModeToggle, type ViewMode } from "@/components/reading/mode-toggle"
import { type ReadingTheme } from "@/components/reading/theme-toggle"
import { READING_HEADER_BAND_REM } from "@/lib/reading/reading-layout"
import { cn } from "@/lib/utils"
import { primeSpeechSynthesisFromUserGesture } from "@/lib/reading/hover-tts"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { useMediaQuery } from "@/hooks/use-media-query"

interface ReadingHeaderProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onBack: () => void
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  /** Read Spanish chunk text aloud when the pointer explores chunks (Web Speech API). */
  hoverTtsEnabled: boolean
  onHoverTtsChange: (enabled: boolean) => void
  /**
   * False fades the whole toolbar out and disables its hit area (see App.tsx's idle
   * timer) — tapping the reading surface elsewhere brings it back. Defaults to true
   * so callers that don't manage this (none currently) get the always-on look.
   */
  visible?: boolean
  /**
   * Free-plan reading-cap nudge: how many more pages of the current ebook a free user can page
   * into before hitting the upgrade gate (see `freeReadingPagesPerBook` in tiers.ts and
   * `goToArticlePage` in App.tsx, which is what actually enforces it). Null/omitted hides the
   * indicator entirely — App.tsx already only computes it for a free user reading an uploaded
   * ebook with more than one page, so this component doesn't re-derive any of those conditions.
   */
  freeEbookPreview?: { pagesRemaining: number; pageCap: number } | null
}

/** Mobile band height — inline minHeight on the mobile gradient/img so rem tweaks always apply (Tailwind var() on children was unreliable). */
const HEADER_BAND_MOBILE = `calc(${READING_HEADER_BAND_REM}rem + env(safe-area-inset-top, 0px))`

export function ReadingHeader({
  mode,
  onModeChange,
  onBack,
  theme,
  onThemeChange,
  hoverTtsEnabled,
  onHoverTtsChange,
  visible = true,
  freeEbookPreview = null,
}: ReadingHeaderProps) {
  // The persistent landing sidebar (see landing-shell-layout.tsx) isn't hidden during reading
  // (readingActive only changes its nav highlighting) and sits on top of this fixed header
  // (z-50 vs. this header's z-40) -- with no inset, the back arrow rendered at the raw left
  // edge lands directly underneath the sidebar's own rail and is entirely unclickable/
  // invisible on desktop. main-header.tsx solves this exact overlap with the same
  // sidebarInsetPx value (see its `contentInsetLeftPx`); mirror that here instead of
  // reaching for a z-index bump, which would fight the sidebar for the same screen space
  // rather than simply not occupying it.
  const { sidebarInsetPx } = useLandingShellNewChat()
  const isMdUp = useMediaQuery("(min-width: 768px)")
  const fixedInset =
    isMdUp && sidebarInsetPx > 0
      ? { left: sidebarInsetPx, right: 0, width: "auto" as const }
      : undefined
  return (
    <header
      className="reading-toolbar fixed top-0 left-0 right-0 z-40 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, ...fixedInset }}
      aria-hidden={!visible}
    >
      {/* Mobile: gradient height = HEADER_BAND_MOBILE (inline). Desktop: short bar only. */}
      <div
        className="absolute inset-x-0 top-0 z-[1] bg-gradient-to-b from-background/80 via-background/40 to-transparent md:hidden"
        style={{ minHeight: HEADER_BAND_MOBILE }}
      />
      <div className="absolute inset-x-0 top-0 z-[1] hidden md:block h-24 min-h-24 bg-gradient-to-b from-background/80 via-background/40 to-transparent" />

      <div className="relative z-[2] flex items-center justify-between px-4 md:px-6 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          tabIndex={visible ? undefined : -1}
          className={cn(
            "back-nav-control flex h-9 w-9 max-md:h-11 max-md:w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-200 ease-in-out hover:bg-muted/35",
            visible ? "pointer-events-auto" : "pointer-events-none",
          )}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 max-md:h-[1.35rem] max-md:w-[1.35rem]" strokeWidth={2.25} aria-hidden />
        </button>

        {freeEbookPreview && (
          // Desktop only here -- centered between the back arrow and the (fairly wide, four-item)
          // control rail on the same row. On mobile that rail alone nearly spans the header, so
          // this would either sit underneath it or force an awkward squeeze; the mobile version
          // below instead gets its own row under the main bar, out of everything's way.
          <Link
            to="/upgrade"
            className={cn(
              "free-preview-pill absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex",
              "items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5",
              "font-sans text-xs font-medium text-reading-pager-ink",
              "border-reading-warm/25 bg-reading-warm/[0.09] shadow-[0_2px_10px_rgba(58,51,46,0.05)]",
              "transition-colors duration-200 ease-in-out hover:bg-reading-warm/[0.16] hover:text-reading-pager-ink-hover",
              "dark:border-reading-warm/20 dark:bg-white/[0.05] dark:hover:bg-reading-warm/[0.12]",
              visible ? "pointer-events-auto" : "pointer-events-none",
            )}
            tabIndex={visible ? undefined : -1}
            aria-label={
              freeEbookPreview.pagesRemaining > 0
                ? `${freeEbookPreview.pagesRemaining} free page${freeEbookPreview.pagesRemaining === 1 ? "" : "s"} left in this book — upgrade for full access`
                : "Free preview ends on this page — upgrade for full access"
            }
          >
            <Sparkles className="h-3 w-3 shrink-0 text-[#b86c4f] dark:text-reading-warm" aria-hidden />
            <span>
              {freeEbookPreview.pagesRemaining > 0
                ? `${freeEbookPreview.pagesRemaining} free page${freeEbookPreview.pagesRemaining === 1 ? "" : "s"} left`
                : "Last free page"}
            </span>
            <span className="opacity-70">Upgrade</span>
          </Link>
        )}

        {/* Right side: one quiet control rail so mode + reader actions feel like a single toolset. */}
        <div
          className={cn(
            "flex items-center gap-0.5 rounded-[0.85rem] border px-1 py-0.5",
            "border-border/45 bg-background/62 shadow-[0_4px_16px_rgba(58,51,46,0.05)] backdrop-blur-sm",
            "dark:border-white/8 dark:bg-[rgba(26,26,26,0.58)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.16)]",
            visible ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          <ModeToggle mode={mode} onModeChange={onModeChange} />
          <div className="mx-0.5 h-6 w-px bg-border/45 dark:bg-white/8" aria-hidden />
          <button
            type="button"
            onClick={() => {
              const next = !hoverTtsEnabled
              if (next) primeSpeechSynthesisFromUserGesture()
              onHoverTtsChange(next)
            }}
            className={cn(
              "hover-tts-toggle-btn flex items-center justify-center w-9 h-9 max-md:w-10.5 max-md:h-10.5 rounded-[0.7rem] text-foreground/82 transition-colors duration-200 ease-in-out hover:bg-muted/35 hover:text-foreground",
              hoverTtsEnabled &&
                "bg-reading-warm/10 text-[#b86c4f] ring-1 ring-reading-warm/[0.18]",
            )}
            aria-pressed={hoverTtsEnabled}
            aria-label={
              hoverTtsEnabled
                ? "Turn off speak on hover"
                : "Speak chunks aloud on hover"
            }
          >
            {hoverTtsEnabled
              ? <Volume2 className="hover-tts-toggle-icon h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />
              : <VolumeX className="hover-tts-toggle-icon h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => {
              onThemeChange(theme === "light" ? "dark" : "light")
            }}
            className="theme-toggle-btn flex items-center justify-center w-9 h-9 max-md:w-10.5 max-md:h-10.5 rounded-[0.7rem] text-foreground/82 hover:bg-muted/35 hover:text-foreground transition-colors duration-200 ease-in-out"
            aria-label="Cycle reading theme"
          >
            {theme === "light"
              ? <Sun className="sun-icon h-4 w-4 max-md:h-5 max-md:w-5" />
              : <Moon className="moon-icon h-4 w-4 max-md:h-5 max-md:w-5" />}
          </button>
          <Link
            to="/settings"
            className="profile-btn flex items-center justify-center w-9 h-9 max-md:w-10.5 max-md:h-10.5 rounded-[0.7rem] text-foreground/82 hover:bg-muted/35 hover:text-foreground transition-colors duration-200 ease-in-out"
            aria-label="Settings"
          >
            <Settings2 className="h-4 w-4 max-md:h-5 max-md:w-5" />
          </Link>
        </div>
      </div>

      {freeEbookPreview && (
        // Mobile: own row under the main bar (see the desktop pill above for why) -- still part
        // of the same fading toolbar, just stacked instead of centered inline.
        <div className="relative z-[2] flex justify-center px-4 pt-1.5 md:hidden">
          <Link
            to="/upgrade"
            className={cn(
              "free-preview-pill flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1",
              "font-sans text-xs font-medium text-reading-pager-ink",
              "border-reading-warm/25 bg-reading-warm/[0.09] shadow-[0_2px_10px_rgba(58,51,46,0.05)]",
              "transition-colors duration-200 ease-in-out hover:bg-reading-warm/[0.16] hover:text-reading-pager-ink-hover",
              "dark:border-reading-warm/20 dark:bg-white/[0.05] dark:hover:bg-reading-warm/[0.12]",
              visible ? "pointer-events-auto" : "pointer-events-none",
            )}
            tabIndex={visible ? undefined : -1}
            aria-label={
              freeEbookPreview.pagesRemaining > 0
                ? `${freeEbookPreview.pagesRemaining} free page${freeEbookPreview.pagesRemaining === 1 ? "" : "s"} left in this book — upgrade for full access`
                : "Free preview ends on this page — upgrade for full access"
            }
          >
            <Sparkles className="h-3 w-3 shrink-0 text-[#b86c4f] dark:text-reading-warm" aria-hidden />
            <span className="tabular-nums">
              {freeEbookPreview.pagesRemaining > 0
                ? `${freeEbookPreview.pagesRemaining} free pages left`
                : "Last free page"}
            </span>
            <span className="opacity-70">Upgrade</span>
          </Link>
        </div>
      )}
    </header>
  )
}
