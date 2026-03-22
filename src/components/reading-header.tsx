"use client"

import { Link } from "react-router-dom"
import { ArrowLeft, Moon, Sun, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle, type ViewMode } from "./mode-toggle"
import { type ReadingTheme } from "./theme-toggle"
import { cn } from "@/lib/utils"
import { READING_HEADER_BAND_REM, READING_HEADER_TEXTURE_SHIFT_UP_PX } from "@/lib/reading-layout"

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
      {/* Mobile only: texture — clipped band; image shifted up so lower part of asset fills the strip */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0 hidden max-md:block overflow-hidden"
        style={{ height: HEADER_BAND_MOBILE, minHeight: HEADER_BAND_MOBILE }}
      >
        <img
          src={theme === "dark" ? "/reading-header-texture-dark.png" : "/reading-header-texture.png"}
          alt=""
          aria-hidden
          className={cn(
            "absolute left-0 right-0 w-full object-cover object-top select-none",
            theme === "dark" ? "opacity-[0.38]" : "opacity-[0.20]",
          )}
          style={{
            top: -READING_HEADER_TEXTURE_SHIFT_UP_PX,
            height: `calc(100% + ${READING_HEADER_TEXTURE_SHIFT_UP_PX}px)`,
          }}
        />
      </div>
      {/* Mobile: gradient height = HEADER_BAND_MOBILE (inline). Desktop: short bar only. */}
      <div
        className="absolute inset-x-0 top-0 z-[1] bg-gradient-to-b from-background/80 via-background/40 to-transparent md:hidden"
        style={{ minHeight: HEADER_BAND_MOBILE }}
      />
      <div className="absolute inset-x-0 top-0 z-[1] hidden md:block h-24 min-h-24 bg-gradient-to-b from-background/80 via-background/40 to-transparent" />

      <div className="relative z-[2] flex items-center justify-between px-4 md:px-6 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="pointer-events-auto text-foreground hover:bg-muted/50 -ml-2 min-h-11 min-w-11 max-md:min-h-[2.75rem] max-md:min-w-[2.75rem] max-md:px-3 max-md:h-11 max-md:w-11 [&_svg]:max-md:h-5 [&_svg]:max-md:w-5"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5 max-md:mr-0" />
          <span className="hidden sm:inline text-sm font-sans">Inicio</span>
        </Button>

        {/* Right side: Mode toggle + Theme + Profile */}
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
            <User className="h-4 w-4 max-md:h-5 max-md:w-5" />
          </Link>
        </div>
      </div>
    </header>
  )
}
