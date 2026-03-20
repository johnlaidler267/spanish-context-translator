"use client"

import { Link } from "react-router-dom"
import { Sun, Moon, User } from "lucide-react"
import type { ReadingTheme } from "./theme-toggle"

interface MainHeaderProps {
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
}

export function MainHeader({ theme, onThemeChange }: MainHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-background/90 via-background/50 to-transparent md:h-20"
        style={{ minHeight: "calc(5rem + env(safe-area-inset-top, 0px))" }}
      />
      <div className="relative flex items-center justify-between min-h-14 px-5 md:px-8 pt-[env(safe-area-inset-top,0px)]">
        <img src="/logo.png" alt="Lector" className="pointer-events-none h-8 w-auto" />
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
          <button
            onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
            className="theme-toggle-btn flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ease-in-out text-foreground hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Toggle theme"
          >
            {theme === "light"
              ? <Moon className="moon-icon h-4 w-4" />
              : <Sun className="sun-icon h-4 w-4" />}
          </button>
          <Link
            to="/settings"
            className="profile-btn flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ease-in-out text-foreground hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Settings"
          >
            <User className="h-4 w-4" />
          </Link>
          <div className="plan-badge plan-badge--header">
            <span className="plan-badge-plan">Free plan</span>
            <span className="plan-badge-dot" aria-hidden>·</span>
            <Link to="/upgrade" className="plan-badge-upgrade">
              Upgrade
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
