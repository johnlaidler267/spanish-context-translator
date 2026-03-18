"use client"

import { Link } from "react-router-dom"
import { User } from "lucide-react"

export function MainHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-transparent h-24" />
      <div className="relative flex items-center justify-end px-5 md:px-8 pt-4">
        <Link
          to="/settings"
          className="pointer-events-auto flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Settings"
        >
          <User className="h-4 w-4" />
        </Link>
      </div>
    </header>
  )
}
