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
      <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/50 to-transparent h-20" />
      <div className="relative flex items-center justify-between h-14 px-5 md:px-8">
        <img src="/logo.png" alt="Lector" className="pointer-events-none h-8 w-auto" />
        <div className="flex items-center gap-1 pointer-events-auto">
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
        </div>
      </div>
    </header>
  )
}
