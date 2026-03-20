"use client"

import { Link } from "react-router-dom"
import { User } from "lucide-react"

export function MainHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/50 to-transparent h-20" />
      <div className="relative flex items-center justify-end h-14 px-5 md:px-8">
        <Link
          to="/settings"
          className="pointer-events-auto flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ease-in-out"
              style={{ color: "#605850" }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          aria-label="Settings"
        >
          <User className="h-4 w-4" />
        </Link>
      </div>
    </header>
  )
}
