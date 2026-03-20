"use client"

import { Link } from "react-router-dom"
import { ArrowLeft, Moon, Sun, Sunset, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle, type ViewMode } from "./mode-toggle"
import { ThemeToggle, type ReadingTheme } from "./theme-toggle"

interface ReadingHeaderProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onBack: () => void
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
}

export function ReadingHeader({ mode, onModeChange, onBack, theme, onThemeChange }: ReadingHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      {/* Subtle gradient fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-transparent h-24" />
      
      <div className="relative flex items-center justify-between px-4 md:px-6 pt-4">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="pointer-events-auto text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline text-sm font-sans">Inicio</span>
        </Button>

        {/* Right side: Theme circles + Mode toggle + Profile */}
        <div className="pointer-events-auto flex items-center gap-3">
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <div className="w-px h-4 bg-border/50" aria-hidden />
          <ModeToggle mode={mode} onModeChange={onModeChange} />
          <button
            onClick={() => {
              const next: Record<ReadingTheme, ReadingTheme> = { light: "sepia", sepia: "dark", dark: "light" }
              onThemeChange(next[theme])
            }}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors duration-200 ease-in-out"
            aria-label="Cycle reading theme"
          >
            {theme === "light" && <Sun className="h-4 w-4" />}
            {theme === "sepia" && <Sunset className="h-4 w-4" />}
            {theme === "dark"  && <Moon className="h-4 w-4" />}
          </button>
          <Link
            to="/settings"
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors duration-200 ease-in-out"
            aria-label="Settings"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
