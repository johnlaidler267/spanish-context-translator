"use client"

import { Link } from "react-router-dom"
import { Sun, Moon, User } from "lucide-react"
import type { ReadingTheme } from "./theme-toggle"

interface MainHeaderProps {
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  /** Free plan pill + mobile strip — landing only */
  showPlanBanner?: boolean
}

function PlanBadgeContent() {
  return (
    <>
      <span className="plan-badge-lead">
        <span className="plan-badge-plan">Free plan</span>
        <span className="plan-badge-dot" aria-hidden>
          ·
        </span>
      </span>
      <Link to="/upgrade" className="plan-badge-upgrade">
        Upgrade
      </Link>
    </>
  )
}

export function MainHeader({
  theme,
  onThemeChange,
  showPlanBanner = false,
}: MainHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div
        className={
          "absolute inset-x-0 top-0 bg-gradient-to-b from-background/90 via-background/50 to-transparent md:h-20 " +
          (showPlanBanner
            ? "max-md:min-h-[calc(7rem+env(safe-area-inset-top,0px))]"
            : "max-md:min-h-[calc(5rem+env(safe-area-inset-top,0px))]")
        }
      />
      <div className={showPlanBanner ? "relative flex flex-col" : "relative"}>
        <div className="flex items-center justify-between min-h-14 px-5 md:px-8 pt-[env(safe-area-inset-top,0px)]">
          <img src="/logo.png" alt="Lector" className="pointer-events-none h-8 w-auto" />
          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto shrink-0">
            <button
              onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
              className="theme-toggle-btn flex items-center justify-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-full transition-colors duration-200 ease-in-out text-foreground hover:bg-muted/50"
              aria-label="Toggle theme"
            >
              {theme === "light"
                ? <Moon className="moon-icon h-4 w-4 max-md:h-5 max-md:w-5" />
                : <Sun className="sun-icon h-4 w-4 max-md:h-5 max-md:w-5" />}
            </button>
            <Link
              to="/settings"
              className="profile-btn flex items-center justify-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-full transition-colors duration-200 ease-in-out text-foreground hover:bg-muted/50"
              aria-label="Settings"
            >
              <User className="h-4 w-4 max-md:h-5 max-md:w-5" />
            </Link>
            {showPlanBanner && (
              <div className="plan-badge plan-badge--header !hidden md:!inline-flex">
                <PlanBadgeContent />
              </div>
            )}
          </div>
        </div>
        {showPlanBanner && (
          <div className="pointer-events-auto md:hidden flex justify-center px-4 pb-2 pt-0.5">
            <div className="plan-badge plan-badge--header plan-badge--mobile-chip">
              <PlanBadgeContent />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
