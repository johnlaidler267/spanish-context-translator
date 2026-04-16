"use client"

import { useCallback, useRef, useState } from "react"
import { Outlet, useOutletContext } from "react-router-dom"
import { LandingSidebar, type LandingSidebarLayout } from "@/components/landing-sidebar"
import { MainHeader } from "@/components/main-header"
import type { ReadingTheme } from "@/components/theme-toggle"

export type LandingShellOutletContext = {
  registerNewChat: (handler: (() => void) | null) => void
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
}

export function LandingShellLayout({
  theme,
  onThemeChange,
  displayName,
  sidebarDisabled,
}: LandingShellLayoutProps) {
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

  const outletContext: LandingShellOutletContext = { registerNewChat }

  return (
    <div className="landing-route-shell landing-route-enter relative z-10 flex min-h-0 min-w-0 w-full flex-1 flex-row max-md:min-h-0 max-md:flex-1">
      <LandingSidebar
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
        onLayoutChange={onSidebarLayoutChange}
        onNewChat={onNewChat}
        disabled={sidebarDisabled}
        displayName={displayName}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:min-h-0 max-md:flex-1">
        <MainHeader
          theme={theme}
          onThemeChange={onThemeChange}
          showPlanBanner={false}
          showBrandWordmark={false}
          onMenuClick={() => setMobileSidebarOpen(true)}
          contentInsetLeftPx={sidebarInsetPx}
        />
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
