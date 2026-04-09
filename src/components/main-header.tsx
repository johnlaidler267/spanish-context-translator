"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Sun, Moon, Settings2, Loader2 } from "lucide-react"
import { BsSunglasses } from "react-icons/bs"
import { useSubscriptionOptional } from "@/contexts/subscription-context"
import { useAuth } from "@/contexts/auth-context"
import { getTier } from "@/lib/tiers"
import { subscriptionRowShowsAsFreePlan } from "@/lib/subscription-display"
import { supabase } from "@/lib/supabase"
import type { ReadingTheme } from "./theme-toggle"

interface MainHeaderProps {
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  /** Free plan pill + mobile strip — landing only */
  showPlanBanner?: boolean
  /**
   * `fixed` — default; overlays scroll (landing). `stacked` — in-flow height so scroll regions
   * below (e.g. /upgrade) never sit under the bar.
   */
  variant?: "fixed" | "stacked"
}

type PlanPill =
  | { mode: "link"; to: string; primary: string; secondary: string }
  | { mode: "signin"; primary: string; secondary: string }

type LinkPlanPill = Extract<PlanPill, { mode: "link" }>

const GUEST_PLAN_PILL: PlanPill = {
  mode: "signin",
  primary: "Sign in",
  secondary: "",
}

const LEXA_LENS_WORD_GRADIENT =
  "inline-block bg-gradient-to-br from-[#2f2926] via-[#4a3f38] to-[#c97a5a] bg-clip-text text-transparent dark:from-[#e8dfd4] dark:via-[#d4a896] dark:to-[#b06b56]"

function daysLeftInTrial(trialEndIso: string | null): number {
  if (!trialEndIso) return 0
  return Math.max(0, Math.ceil((new Date(trialEndIso).getTime() - Date.now()) / 86_400_000))
}

function planPillFromRow(
  row: {
    plan_id: string
    status: string
    trial_end: string | null
  } | null,
  isAnonymous: boolean,
): LinkPlanPill {
  const toSettingsBilling = "/settings?tab=billing"
  const toUpgrade = "/upgrade"
  /** Logged-in user with no subscription row yet — treat as free tier in UI. */
  const authenticatedFreePill: LinkPlanPill = {
    mode: "link",
    to: toUpgrade,
    primary: isAnonymous ? "Free · Guest" : "Free Plan",
    secondary: "Upgrade",
  }

  if (!row || subscriptionRowShowsAsFreePlan(row)) return authenticatedFreePill

  let name = "Plan"
  try {
    name = getTier(row.plan_id).name
  } catch {
    /* unknown plan_id in DB */
  }
  const { status } = row

  if (status === "trialing" && row.plan_id !== "free") {
    const d = daysLeftInTrial(row.trial_end)
    const dayWord = d === 1 ? "day" : "days"
    return {
      mode: "link",
      to: toSettingsBilling,
      primary: `${name} Trial`,
      secondary: `${d} ${dayWord} left`,
    }
  }

  if (status === "active" && row.plan_id !== "free") {
    return { mode: "link", to: toSettingsBilling, primary: name, secondary: "Plan" }
  }

  if (status === "past_due" && row.plan_id !== "free") {
    return {
      mode: "link",
      to: toSettingsBilling,
      primary: `${name} Plan`,
      secondary: "Payment Failed",
    }
  }

  return authenticatedFreePill
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
  variant = "fixed",
}: MainHeaderProps) {
  const stacked = variant === "stacked"
  return (
    <header
      className={
        stacked
          ? "relative z-40 w-full shrink-0 pointer-events-none min-h-[calc(5rem+env(safe-area-inset-top,0px))] md:min-h-20"
          : "fixed top-0 left-0 right-0 z-40 pointer-events-none"
      }
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
          <Link
            to="/"
            className="pointer-events-auto min-w-0 shrink select-none"
            aria-label="Lexa Lens — home"
          >
            <span
              className={
                "font-fraunces text-[1.2rem] font-bold leading-none tracking-[-0.03em] antialiased max-md:text-[1.15rem] md:text-[1.35rem] " +
                "[font-feature-settings:'kern'_1,'liga'_1] inline-flex items-center gap-px"
              }
            >
              <span className={LEXA_LENS_WORD_GRADIENT}>Lexa</span>
              <BsSunglasses
                className="h-[0.68rem] w-[0.68rem] shrink-0 text-[#4a3f38] dark:text-[#d4a896]"
                aria-hidden
              />
              <span className={LEXA_LENS_WORD_GRADIENT}>Lens</span>
            </span>
          </Link>
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
              <Settings2 className="h-4 w-4 max-md:h-5 max-md:w-5" />
            </Link>
            {showPlanBanner && (
              <div className="plan-badge plan-badge--header !hidden md:!inline-flex">
                <PlanBadgeContent />
              </div>
            )}
          </div>
        </div>
        {showPlanBanner && (
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
