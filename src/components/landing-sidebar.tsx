"use client"

import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  ChevronsLeft,
  ChevronsRight,
  Compass,
  Home,
  Library,
} from "lucide-react"
import { BsTranslate } from "react-icons/bs"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { LexaLensWordmark } from "./lexa-lens-wordmark"
import { LandingSidebarProfile } from "./landing-sidebar-profile"

const SIDEBAR_EXPANDED_PX = 256
const SIDEBAR_COLLAPSED_PX = 72

const navIconClass = "mx-auto block h-[18px] w-[18px] shrink-0"
const navIconStroke = 1.65

function SidebarToggleIcon({
  isMdUp,
  desktopExpanded,
  mobileOpen,
  className,
}: {
  isMdUp: boolean
  desktopExpanded: boolean
  mobileOpen: boolean
  className?: string
}) {
  const cls = cn("h-4 w-4 shrink-0", className)
  if (!isMdUp && mobileOpen) return <ChevronsLeft className={cls} strokeWidth={navIconStroke} aria-hidden />
  if (isMdUp && desktopExpanded) return <ChevronsLeft className={cls} strokeWidth={navIconStroke} aria-hidden />
  return <ChevronsRight className={cls} strokeWidth={navIconStroke} aria-hidden />
}

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
}

export function LandingSidebar({
  mobileOpen,
  onMobileOpenChange,
  onLayoutChange,
  onNewChat,
  disabled,
  displayName,
}: LandingSidebarProps) {
  const location = useLocation()
  const isMdUp = useMediaQuery("(min-width: 768px)")
  const [desktopExpanded, setDesktopExpanded] = useState(true)

  const pathname = location.pathname
  const homeActive = pathname === "/"
  const discoverActive = pathname === "/upgrade"
  const libraryActive = pathname.startsWith("/settings")

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

  const expanded = isMdUp ? desktopExpanded : mobileOpen
  const compactRail = isMdUp && !desktopExpanded

  const navItemClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 px-3 py-2.5 text-sm font-normal tracking-[-0.015em] text-foreground/90",
      "transition-[color,background-color,box-shadow,transform] duration-200 ease-out",
      "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99]",
      "outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      active
        ? "landing-sidebar-nav-active bg-secondary text-foreground motion-safe:hover:bg-secondary"
        : "rounded-lg hover:bg-muted/50 hover:text-foreground motion-safe:hover:shadow-sm",
      compactRail && "justify-center px-0 gap-0",
    )

  const handleToggle = () => {
    if (isMdUp) setDesktopExpanded((e) => !e)
    else onMobileOpenChange(!mobileOpen)
  }

  const handleNewChat = () => {
    onNewChat()
    if (!isMdUp) onMobileOpenChange(false)
  }

  const sidebarInner = (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden border-border/80 bg-background font-display tracking-[-0.015em] [font-feature-settings:'kern'_1,'liga'_1,'onum'_1] [text-rendering:optimizeLegibility] antialiased",
        isMdUp ? "border-r" : "border-r",
      )}
    >
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
          onClick={() => !isMdUp && onMobileOpenChange(false)}
        >
          <LexaLensWordmark
            className={cn(!compactRail && "text-[1.05rem] md:text-[1.2rem]", compactRail && "text-[1.15rem]")}
            compact={compactRail}
          />
        </Link>
        <button
          type="button"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 text-foreground/80",
            "transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
            "hover:bg-muted/60 hover:text-foreground motion-safe:hover:scale-105 motion-safe:active:scale-95 motion-safe:hover:shadow-sm",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={
            !isMdUp && mobileOpen
              ? "Close sidebar"
              : isMdUp && desktopExpanded
                ? "Collapse sidebar"
                : "Expand sidebar"
          }
          aria-expanded={expanded}
          onClick={handleToggle}
        >
          <SidebarToggleIcon
            isMdUp={isMdUp}
            desktopExpanded={desktopExpanded}
            mobileOpen={mobileOpen}
          />
        </button>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-3"
        aria-label="Main"
      >
        <Link
          to="/"
          className={navItemClass(homeActive)}
          onClick={() => !isMdUp && onMobileOpenChange(false)}
        >
          <span
            className={cn(
              "text-foreground/85 transition-transform duration-200 ease-out motion-safe:group-hover:scale-110",
              compactRail && "shrink-0",
            )}
          >
            <Home className={navIconClass} strokeWidth={navIconStroke} aria-hidden />
          </span>
          {!compactRail ? <span className="truncate">Home</span> : null}
        </Link>
        <Link
          to="/upgrade"
          className={navItemClass(discoverActive)}
          onClick={() => !isMdUp && onMobileOpenChange(false)}
        >
          <span
            className={cn(
              "text-foreground/85 transition-transform duration-200 ease-out motion-safe:group-hover:scale-110",
              compactRail && "shrink-0",
            )}
          >
            <Compass className={navIconClass} strokeWidth={navIconStroke} aria-hidden />
          </span>
          {!compactRail ? <span className="truncate">Discover</span> : null}
        </Link>
        <Link
          to="/settings"
          className={navItemClass(libraryActive)}
          onClick={() => !isMdUp && onMobileOpenChange(false)}
        >
          <span
            className={cn(
              "text-foreground/85 transition-transform duration-200 ease-out motion-safe:group-hover:scale-110",
              compactRail && "shrink-0",
            )}
          >
            <Library className={navIconClass} strokeWidth={navIconStroke} aria-hidden />
          </span>
          {!compactRail ? <span className="truncate">My Library</span> : null}
        </Link>
      </nav>

      <div
        className={cn(
          "mt-auto flex w-full shrink-0 flex-col border-t border-border/60 bg-background pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]",
        )}
      >
        <div className={cn("p-3 pb-2", compactRail && "px-2")}>
          <button
            type="button"
            className={cn(
              "group flex w-full items-center justify-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-2.5 text-sm font-normal tracking-[-0.015em] text-foreground/90",
              "transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
              "hover:bg-muted/40 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99]",
              "disabled:pointer-events-none disabled:opacity-50",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compactRail && "px-0 py-2.5",
            )}
            onClick={handleNewChat}
            disabled={disabled}
          >
            <BsTranslate
              className="h-4 w-4 shrink-0 text-foreground/80 transition-transform duration-200 ease-out motion-safe:group-hover:rotate-6 motion-safe:group-hover:scale-105"
              aria-hidden
            />
            {!compactRail ? <span>New translation</span> : null}
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
          className="fixed inset-0 z-[45] bg-black/35 backdrop-blur-[1px] md:hidden"
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
                "fixed bottom-0 left-0 top-0 min-h-0 w-[min(19rem,86vw)] max-w-[19rem] transition-transform duration-200 ease-out md:hidden",
                mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
              ),
        )}
        aria-hidden={!isMdUp && !mobileOpen ? true : undefined}
        aria-modal={!isMdUp && mobileOpen ? true : undefined}
        role={!isMdUp && mobileOpen ? "dialog" : undefined}
        aria-label={!isMdUp && mobileOpen ? "Navigation" : undefined}
      >
        {sidebarInner}
      </aside>

      {!isMdUp ? (
        <button
          type="button"
          className={cn(
            "landing-new-chat-fab group fixed bottom-5 right-4 z-[48] flex items-center gap-2 rounded-full border border-border/80 bg-card px-4 py-3 font-display text-sm font-normal tracking-[-0.015em] text-foreground shadow-md [font-feature-settings:'kern'_1,'liga'_1,'onum'_1] [text-rendering:optimizeLegibility] antialiased",
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
