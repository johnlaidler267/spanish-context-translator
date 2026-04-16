"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Sun, Moon, Settings2, Loader2, Menu } from "lucide-react"
import { useSubscriptionOptional } from "@/contexts/subscription-context"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { GUEST_PLAN_PILL, planPillFromRow, type LinkPlanPill } from "@/lib/plan-pill"
import type { ReadingTheme } from "./theme-toggle"
import { LexaLensWordmark } from "./lexa-lens-wordmark"
import { useMediaQuery } from "@/hooks/use-media-query"

interface MainHeaderProps {
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  /** Free plan pill + mobile strip — landing only */
  showPlanBanner?: boolean
  /** When false, the LexaLens wordmark is omitted (e.g. shown in landing sidebar). Default true. */
  showBrandWordmark?: boolean
  /** Mobile: open landing sidebar (shown when `showBrandWordmark` is false). */
  onMenuClick?: () => void
  /**
   * Desktop landing: left inset in px so the fixed bar aligns with the main column past the sidebar.
   * Ignored below `md` and when 0.
   */
  contentInsetLeftPx?: number
  /**
   * `fixed` — default; overlays scroll (landing). `stacked` — in-flow height so scroll regions
   * below (e.g. /upgrade) never sit under the bar.
   */
  variant?: "fixed" | "stacked"
}

function PlanBadgeLoading() {
  return (
    <span
      className="inline-flex items-center justify-center gap-2 min-h-[1.25em] min-w-[5.5rem]"
      aria-busy="true"
      aria-label="Loading plan"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground opacity-70" aria-hidden />
    </span>
  )
}

/** Landing plan pill — subscription copy from DB; context status invalidates when coarse status changes. */
function PlanBadgeContent() {
  const ctxStatus = useSubscriptionOptional()?.status ?? null
  const { user, isLoading: authLoading, openAuthModal } = useAuth()
  const [pill, setPill] = useState<LinkPlanPill | null>(null)

  useEffect(() => {
    if (!user) {
      setPill(null)
      return
    }

    let cancelled = false

    void (async () => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("plan_id, status, trial_end")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .maybeSingle<{ plan_id: string; status: string; trial_end: string | null }>()

      if (cancelled) return
      setPill(planPillFromRow(data ?? null, user.is_anonymous === true))
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id, user?.is_anonymous, ctxStatus])

  if (authLoading) {
    return <PlanBadgeLoading />
  }

  if (!user) {
    const guest = GUEST_PLAN_PILL
    const inner = (
      <>
        <span className="plan-badge-lead">
          <span className="plan-badge-plan">{guest.primary}</span>
          {guest.secondary ? (
            <span className="plan-badge-dot" aria-hidden>
              ·
            </span>
          ) : null}
        </span>
        {guest.secondary ? <span className="plan-badge-upgrade">{guest.secondary}</span> : null}
      </>
    )
    return (
      <button
        type="button"
        className="contents cursor-pointer text-left border-0 bg-transparent p-0 [font:inherit] text-inherit"
        onClick={() => openAuthModal()}
        aria-label="Sign in"
      >
        {inner}
      </button>
    )
  }

  if (pill === null) {
    return <PlanBadgeLoading />
  }

  const inner = (
    <>
      <span className="plan-badge-lead">
        <span className="plan-badge-plan">{pill.primary}</span>
        {pill.secondary ? (
          <span className="plan-badge-dot" aria-hidden>
            ·
          </span>
        ) : null}
      </span>
      {pill.secondary ? <span className="plan-badge-upgrade">{pill.secondary}</span> : null}
    </>
  )

  return (
    <Link to={pill.to} className="contents">
      {inner}
    </Link>
  )
}

export function MainHeader({
  theme,
  onThemeChange,
  showPlanBanner = false,
  showBrandWordmark = true,
  onMenuClick,
  contentInsetLeftPx = 0,
  variant = "fixed",
}: MainHeaderProps) {
  const stacked = variant === "stacked"
  const isMdUp = useMediaQuery("(min-width: 768px)")
  const fixedInset =
    !stacked && isMdUp && contentInsetLeftPx > 0
      ? { left: contentInsetLeftPx, right: 0, width: "auto" as const }
      : undefined

  return (
    <header
      className={
        stacked
          ? "relative z-40 w-full shrink-0 pointer-events-none min-h-[calc(5rem+env(safe-area-inset-top,0px))] md:min-h-20"
          : "fixed top-0 left-0 right-0 z-40 pointer-events-none"
      }
      style={fixedInset}
    >
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
          <div className="pointer-events-auto flex min-w-0 shrink items-center gap-2">
            {!showBrandWordmark && onMenuClick ? (
              <button
                type="button"
                onClick={onMenuClick}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/50 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            {showBrandWordmark ? (
              <Link to="/" className="min-w-0 shrink select-none" aria-label="Lexa Lens — home">
                <LexaLensWordmark />
              </Link>
            ) : null}
          </div>
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
            {showBrandWordmark ? (
              <>
                <Link
                  to="/settings"
                  className="profile-btn flex items-center justify-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-full transition-colors duration-200 ease-in-out text-foreground hover:bg-muted/50"
                  aria-label="Settings"
                >
                  <Settings2 className="h-4 w-4 max-md:h-5 max-md:w-5" />
                </Link>
                {showPlanBanner && (
                  <div className="plan-badge plan-badge--header !hidden md:!inline-flex">
                    <PlanBadgeContent />
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
        {showBrandWordmark && showPlanBanner && (
          <div className="pointer-events-auto md:hidden w-full px-2.5 pb-2 pt-0.5">
            <div className="plan-badge plan-badge--header plan-badge--mobile-chip w-full">
              <PlanBadgeContent />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
