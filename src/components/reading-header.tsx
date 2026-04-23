"use client"

import { Link } from "react-router-dom"
import { ChevronLeft, Moon, Sun, Settings2, Volume2 } from "lucide-react"
import { ModeToggle, type ViewMode } from "./mode-toggle"
import { type ReadingTheme } from "./theme-toggle"
import { READING_HEADER_BAND_REM } from "@/lib/reading-layout"
import { cn } from "@/lib/utils"
import { primeSpeechSynthesisFromUserGesture } from "@/lib/hover-tts"

interface ReadingHeaderProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onBack: () => void
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  /** Read Spanish chunk text aloud when the pointer explores chunks (Web Speech API). */
  hoverTtsEnabled: boolean
  onHoverTtsChange: (enabled: boolean) => void
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
}: ReadingHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      {/* Mobile: gradient height = HEADER_BAND_MOBILE (inline). Desktop: short bar only. */}
      <div
        className="absolute inset-x-0 top-0 z-[1] bg-gradient-to-b from-background/80 via-background/40 to-transparent md:hidden"
        style={{ minHeight: HEADER_BAND_MOBILE }}
      />
      <div className="absolute inset-x-0 top-0 z-[1] hidden md:block h-24 min-h-24 bg-gradient-to-b from-background/80 via-background/40 to-transparent" />

      <div className="relative z-[2] flex items-center justify-between px-4 md:px-6 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        <Link
          to="/"
          onClick={onBack}
          className="back-nav-control pointer-events-auto flex h-9 w-9 max-md:h-11 max-md:w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-200 ease-in-out hover:bg-muted/35"
          aria-label="Back to home"
        >
          <ChevronLeft className="h-5 w-5 max-md:h-[1.35rem] max-md:w-[1.35rem]" strokeWidth={2.25} aria-hidden />
        </Link>

        {/* Right side: one quiet control rail so mode + reader actions feel like a single toolset. */}
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-0.5 rounded-[0.85rem] border px-1 py-0.5",
            "border-border/45 bg-background/62 shadow-[0_4px_16px_rgba(58,51,46,0.05)] backdrop-blur-sm",
            "dark:border-white/8 dark:bg-[rgba(26,26,26,0.58)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.16)]",
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
                "bg-[#c97a5a]/10 text-[#b86c4f] ring-1 ring-[#c97a5a]/18",
            )}
            aria-pressed={hoverTtsEnabled}
            aria-label={
              hoverTtsEnabled
                ? "Turn off speak on hover"
                : "Speak chunks aloud on hover"
            }
          >
            <Volume2 className="hover-tts-toggle-icon h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />
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
    </header>
  )
}
