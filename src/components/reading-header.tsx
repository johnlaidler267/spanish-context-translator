"use client"

import { Link } from "react-router-dom"
import { Moon, Sun, Settings2 } from "lucide-react"
import { ModeToggle, type ViewMode } from "./mode-toggle"
import { type ReadingTheme } from "./theme-toggle"
import { READING_HEADER_BAND_REM } from "@/lib/reading-layout"

interface ReadingHeaderProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onBack: () => void
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
}

/** Mobile band height — inline minHeight on the mobile gradient/img so rem tweaks always apply (Tailwind var() on children was unreliable). */
const HEADER_BAND_MOBILE = `calc(${READING_HEADER_BAND_REM}rem + env(safe-area-inset-top, 0px))`

export function ReadingHeader({ mode, onModeChange, onBack, theme, onThemeChange }: ReadingHeaderProps) {
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
          className="pointer-events-auto min-w-0 shrink select-none"
          aria-label="LexaLens — home"
        >
          <span className="font-fraunces text-[1.2rem] font-semibold leading-none tracking-[-0.03em] text-foreground antialiased max-md:text-[1.15rem] md:text-[1.35rem] [font-feature-settings:'kern'_1,'liga'_1]">
            LexaLens
          </span>
        </Link>

        {/* Right side: Mode toggle + Theme + Settings */}
        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
          <ModeToggle mode={mode} onModeChange={onModeChange} />
          <button
            type="button"
            onClick={() => {
              onThemeChange(theme === "light" ? "dark" : "light")
            }}
            className="theme-toggle-btn flex items-center justify-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-full text-foreground hover:bg-muted/50 transition-colors duration-200 ease-in-out"
            aria-label="Cycle reading theme"
          >
            {theme === "light"
              ? <Sun className="sun-icon h-4 w-4 max-md:h-5 max-md:w-5" />
              : <Moon className="moon-icon h-4 w-4 max-md:h-5 max-md:w-5" />}
          </button>
          <Link
            to="/settings"
            className="profile-btn flex items-center justify-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-full text-foreground hover:bg-muted/50 transition-colors duration-200 ease-in-out"
            aria-label="Settings"
          >
            <Settings2 className="h-4 w-4 max-md:h-5 max-md:w-5" />
          </Link>
        </div>
      </div>
    </header>
  )
}
