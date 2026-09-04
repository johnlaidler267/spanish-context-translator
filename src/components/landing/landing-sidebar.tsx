"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Compass, Home } from "lucide-react"
import { BsTranslate } from "react-icons/bs"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { LexaLensWordmark } from "@/components/lexa-lens-wordmark"
import { LandingSidebarProfile } from "@/components/landing/landing-sidebar-profile"

const SIDEBAR_EXPANDED_PX = 256
const SIDEBAR_COLLAPSED_PX = 72
/** Small buffer so a quick mouse pass over the rail edge doesn't flicker collapsed/expanded. */
const HOVER_COLLAPSE_DELAY_MS = 250

const navIconClass = "mx-auto block h-[18px] w-[18px] shrink-0"
const navIconStroke = 1.65

const NAV_ITEMS = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/discover", label: "Discover", Icon: Compass },
] as const

export type LandingSidebarLayout = {
  /** Pixels to inset fixed header on desktop; 0 on mobile overlay. */
  desktopRailPx: number
}

type LandingSidebarProps = {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onLayoutChange: (layout: LandingSidebarLayout) => void
  onNewChat: () => void
  disabled?: boolean
  displayName: string
  readingActive?: boolean
  onExitReading?: () => void
}

export function LandingSidebar({
  mobileOpen,
  onMobileOpenChange,
  onLayoutChange,
  onNewChat,
  disabled,
  displayName,
  readingActive = false,
  onExitReading,
}: LandingSidebarProps) {
  const location = useLocation()
  const isMdUp = useMediaQuery("(min-width: 768px)")
  const [desktopHovering, setDesktopHovering] = useState(false)
  const desktopExpanded = desktopHovering
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCollapseTimeout = useCallback(() => {
    if (collapseTimeoutRef.current != null) {
      clearTimeout(collapseTimeoutRef.current)
      collapseTimeoutRef.current = null
    }
  }, [])

  const handleSidebarMouseEnter = useCallback(() => {
    if (!isMdUp) return
    clearCollapseTimeout()
    setDesktopHovering(true)
  }, [isMdUp, clearCollapseTimeout])

  const handleSidebarMouseLeave = useCallback(() => {
    if (!isMdUp) return
    clearCollapseTimeout()
    collapseTimeoutRef.current = setTimeout(() => {
      setDesktopHovering(false)
    }, HOVER_COLLAPSE_DELAY_MS)
  }, [isMdUp, clearCollapseTimeout])

  useEffect(() => clearCollapseTimeout, [clearCollapseTimeout])

  const pathname = location.pathname
  /** Reading renders on "/" without a route change, so path alone would mislabel Home as current. */
  const homeActive = pathname === "/" && !readingActive
  /** Home composer puts submit bottom-right; same corner as this FAB — hide FAB there only. */
  const discoverActive = pathname === "/discover"
  const showMobileNewChatFab = !isMdUp && pathname !== "/" && !discoverActive

  const navActiveIndex = homeActive ? 0 : discoverActive ? 1 : -1

  const navWrapRef = useRef<HTMLDivElement>(null)
  const navItemRefs = useRef<(HTMLAnchorElement | null)[]>([null, null])
  const previousPathnameRef = useRef(pathname)
  const [navIndicator, setNavIndicator] = useState({ top: 0, height: 0, opacity: 0 })

  const syncNavIndicator = useCallback(() => {
    const wrap = navWrapRef.current
    if (!wrap) return
    if (navActiveIndex < 0) {
      setNavIndicator((prev) => ({ ...prev, opacity: 0 }))
      return
    }
    const el = navItemRefs.current[navActiveIndex]
    if (!el) return
    const w = wrap.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setNavIndicator({
      top: r.top - w.top,
      height: r.height,
      opacity: 1,
    })
  }, [navActiveIndex])

  useLayoutEffect(() => {
    syncNavIndicator()
  }, [syncNavIndicator])

  useEffect(() => {
    const wrap = navWrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => syncNavIndicator())
    ro.observe(wrap)
    window.addEventListener("resize", syncNavIndicator)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", syncNavIndicator)
    }
  }, [syncNavIndicator])

  useEffect(() => {
    if (!isMdUp) {
      onLayoutChange({ desktopRailPx: 0 })
      return
    }
    onLayoutChange({
      desktopRailPx: desktopExpanded ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX,
    })
  }, [isMdUp, desktopExpanded, onLayoutChange])

  useEffect(() => {
    if (!isMdUp && mobileOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = prev
      }
    }
    return undefined
  }, [isMdUp, mobileOpen])

  useEffect(() => {
    if (!mobileOpen || isMdUp) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileOpen, isMdUp, onMobileOpenChange])

  useEffect(() => {
    if (previousPathnameRef.current !== pathname && !isMdUp && mobileOpen) {
      onMobileOpenChange(false)
    }
    previousPathnameRef.current = pathname
  }, [pathname, isMdUp, mobileOpen, onMobileOpenChange])

  const compactRail = isMdUp && !desktopExpanded

  const navItemClass = (active: boolean) =>
    cn(
      "group relative z-10 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm tracking-[-0.008em]",
      "transition-colors duration-200 ease-out",
      "outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      active
        ? "font-medium text-foreground"
        : "font-normal text-foreground/75 hover:bg-muted/60 hover:text-foreground",
      compactRail && "justify-center px-0 gap-0",
    )

  const handleNewChat = () => {
    onNewChat()
    if (!isMdUp) onMobileOpenChange(false)
  }

  /** Link to "/" is a no-op mid-read; tear down the session so Home actually goes home. */
  const handleGoHome = () => {
    if (!readingActive) return
    onExitReading?.()
    if (!isMdUp) onMobileOpenChange(false)
  }

  const sidebarInner = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-r border-border/60 bg-background font-display tracking-[-0.008em] [font-feature-settings:'kern'_1,'liga'_1,'onum'_1] [text-rendering:optimizeLegibility] antialiased">
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-3.5",
          compactRail && "flex-col gap-3 px-2 py-4",
        )}
      >
        <Link
          to="/"
          className={cn(
            "pointer-events-auto min-w-0 flex-1 select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "transition-[transform,opacity] duration-200 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]",
            compactRail && "flex flex-1 items-center justify-center",
          )}
          aria-label="Lexa Lens — home"
          onClick={handleGoHome}
        >
          <LexaLensWordmark
            className={cn(!compactRail && "text-[1.05rem] md:text-[1.2rem]", compactRail && "text-[1.15rem]")}
            compact={compactRail}
          />
        </Link>
      </div>

      <nav
        className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3", compactRail && "px-2")}
        aria-label="Main"
      >
        {!compactRail ? (
          <p className="px-3 pb-2 pt-1 font-sans text-label-xs font-bold uppercase text-muted-foreground/70">
            Browse
          </p>
        ) : null}
        <div ref={navWrapRef} className="relative flex min-h-0 flex-col gap-1">
          <div
            aria-hidden
            className={cn(
              "landing-sidebar-nav-indicator pointer-events-none z-0 bg-secondary",
              "motion-safe:transition-[transform,height,opacity] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
            style={{
              height: navIndicator.height || undefined,
              opacity: navIndicator.opacity,
              transform: `translateY(${navIndicator.top}px)`,
            }}
          />
          {NAV_ITEMS.map(({ to, label, Icon }, index) => {
            const active = index === navActiveIndex
            return (
              <Link
                key={to}
                ref={(el) => {
                  navItemRefs.current[index] = el
                }}
                to={to}
                onClick={to === "/" ? handleGoHome : undefined}
                aria-current={active ? "page" : undefined}
                title={compactRail ? label : undefined}
                className={navItemClass(active)}
              >
                <span
                  className={cn(
                    "shrink-0 transition-colors duration-200 ease-out",
                    active ? "text-primary" : "text-foreground/60 group-hover:text-foreground/85",
                  )}
                >
                  <Icon className={navIconClass} strokeWidth={navIconStroke} aria-hidden />
                </span>
                <span className={cn("truncate", compactRail && "sr-only")}>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div
        className={cn(
          "mt-auto flex w-full shrink-0 flex-col border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom,0px)] md:pb-0",
        )}
      >
        <div className={cn("p-3 pb-2", compactRail && "px-2")}>
          <button
            type="button"
            className={cn(
              "group flex w-full items-center justify-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-sm font-medium tracking-[-0.008em] text-foreground/90 shadow-sm",
              "transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
              "hover:border-primary/40 hover:bg-muted hover:text-foreground hover:shadow-md",
              "disabled:pointer-events-none disabled:opacity-50",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compactRail && "px-0 py-2.5",
            )}
            title={compactRail ? "New translation" : undefined}
            onClick={handleNewChat}
            disabled={disabled}
          >
            <BsTranslate className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className={cn(compactRail && "sr-only")}>New translation</span>
          </button>
        </div>
        <LandingSidebarProfile
          displayName={displayName}
          compactRail={compactRail}
          onNavigate={() => !isMdUp && onMobileOpenChange(false)}
        />
      </div>
    </div>
  )

  return (
    <>
      {!isMdUp && mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-black/40 backdrop-blur-sm md:hidden"
          aria-label="Close menu"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "landing-sidebar z-[50] flex min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          isMdUp
            ? cn(
                "relative self-stretch h-[100dvh] min-h-0 transition-[width] duration-200 ease-out",
                desktopExpanded ? "w-64" : "w-[4.5rem]",
              )
            : cn(
                "fixed bottom-0 left-0 top-0 min-h-0 w-[min(19rem,86vw)] max-w-[19rem] shadow-2xl transition-transform duration-200 ease-out md:hidden",
                mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
              ),
        )}
        aria-hidden={!isMdUp && !mobileOpen ? true : undefined}
        aria-modal={!isMdUp && mobileOpen ? true : undefined}
        role={!isMdUp && mobileOpen ? "dialog" : undefined}
        aria-label={!isMdUp && mobileOpen ? "Navigation" : undefined}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {sidebarInner}
      </aside>

      {showMobileNewChatFab ? (
        <button
          type="button"
          className={cn(
            "landing-new-chat-fab group fixed bottom-5 right-4 z-[48] flex items-center gap-2 rounded-full border border-border/80 bg-card px-4 py-3 font-display text-sm font-normal tracking-[-0.008em] text-foreground shadow-md [font-feature-settings:'kern'_1,'liga'_1,'onum'_1] [text-rendering:optimizeLegibility] antialiased",
            "transition-[opacity,transform,box-shadow,background-color] duration-200 ease-out hover:bg-muted/30 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] md:hidden",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mobileOpen ? "opacity-0 pointer-events-none" : "opacity-100",
          )}
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          onClick={handleNewChat}
          disabled={disabled}
          aria-label="New translation"
        >
          <BsTranslate
            className="h-[18px] w-[18px] shrink-0 text-foreground/80 transition-transform duration-200 ease-out motion-safe:group-hover:rotate-6 motion-safe:group-hover:scale-105"
            aria-hidden
          />
          <span>New translation</span>
        </button>
      ) : null}
    </>
  )
}
