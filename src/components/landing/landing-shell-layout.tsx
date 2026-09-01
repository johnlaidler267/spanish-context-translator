"use client"

import { useCallback, useRef, useState } from "react"
import { Outlet, useLocation, useOutletContext } from "react-router-dom"
import { LandingSidebar, type LandingSidebarLayout } from "@/components/landing/landing-sidebar"
import { MainHeader } from "@/components/main-header"
import type { ReadingTheme } from "@/components/reading/theme-toggle"

export type LandingShellOutletContext = {
  registerNewChat: (handler: (() => void) | null) => void
  sidebarInsetPx: number
}

export function useLandingShellNewChat(): LandingShellOutletContext {
  const ctx = useOutletContext<LandingShellOutletContext | undefined>()
  if (ctx == null) {
    throw new Error("useLandingShellNewChat must be used under LandingShellLayout")
  }
  return ctx
}

type LandingShellLayoutProps = {
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  displayName: string
  sidebarDisabled: boolean
  readingActive?: boolean
  onExitReading?: () => void
}

export function LandingShellLayout({
  theme,
  onThemeChange,
  displayName,
  sidebarDisabled,
  readingActive = false,
  onExitReading,
}: LandingShellLayoutProps) {
  const location = useLocation()
  // Discover's colorful card grid scrolls fully opaque content underneath a
  // fixed/overlay header, so its own type-badge pills end up visually
  // colliding with the header's buttons. `stacked` reserves real space
  // in-flow instead (same fix already used on /upgrade for the same reason).
  const isDiscover = location.pathname === "/discover"
  const headerVariant = isDiscover ? "stacked" : "fixed"
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [sidebarInsetPx, setSidebarInsetPx] = useState(0)
  const onSidebarLayoutChange = useCallback((layout: LandingSidebarLayout) => {
    setSidebarInsetPx(layout.desktopRailPx)
  }, [])
  const newChatHandlerRef = useRef<(() => void) | null>(null)
  const registerNewChat = useCallback((handler: (() => void) | null) => {
    newChatHandlerRef.current = handler
  }, [])

  const onNewChat = useCallback(() => {
    newChatHandlerRef.current?.()
  }, [])

  const outletContext: LandingShellOutletContext = { registerNewChat, sidebarInsetPx }

  return (
    <div className="landing-route-shell landing-route-enter relative z-10 flex h-[100dvh] min-h-0 min-w-0 w-full flex-1 flex-row overflow-hidden max-md:min-h-0 max-md:flex-1">
      <LandingSidebar
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
        onLayoutChange={onSidebarLayoutChange}
        onNewChat={onNewChat}
        disabled={sidebarDisabled}
        displayName={displayName}
        readingActive={readingActive}
        onExitReading={onExitReading}
      />
      <div
        className={
          "flex min-h-0 min-w-0 flex-1 flex-col max-md:min-h-0 max-md:flex-1" +
          (isDiscover ? " discover-shell-bg" : "")
        }
      >
        {!readingActive ? (
          <MainHeader
            theme={theme}
            onThemeChange={onThemeChange}
            showPlanBanner={false}
            showMobilePlanBanner
            showBrandWordmark={false}
            onMenuClick={() => setMobileSidebarOpen(true)}
            contentInsetLeftPx={sidebarInsetPx}
            variant={headerVariant}
            // Discover paints its own background on this wrapper
            // (`discover-shell-bg` above) all the way up behind the header,
            // so the header has no backdrop of its own to blend -- and
            // needs to stay pinned itself, since Discover unlocks
            // document-level scroll on mobile (see mobile-scroll-discover
            // in index.css), which would otherwise carry the header away
            // with the rest of the page.
            backdropClassName={isDiscover ? "bg-transparent" : undefined}
            stickyStacked={isDiscover}
          />
        ) : null}
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
