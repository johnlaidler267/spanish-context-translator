"use client"

import { Link } from "react-router-dom"
import { ArrowLeft, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle, type ViewMode } from "./mode-toggle"

interface ReadingHeaderProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onBack: () => void
}

export function ReadingHeader({ mode, onModeChange, onBack }: ReadingHeaderProps) {
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
          <span className="hidden sm:inline text-sm">Back</span>
        </Button>

        {/* Right side: Mode toggle + Profile */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <ModeToggle mode={mode} onModeChange={onModeChange} />
          <Link
            to="/settings"
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Settings"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
