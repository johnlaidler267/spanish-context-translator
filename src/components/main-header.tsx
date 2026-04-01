"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Sun, Moon, User } from "lucide-react"
import { useSubscription } from "@/contexts/subscription-context"
import { getTier, type TierId } from "@/lib/tiers"
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

type PlanPill = { to: string; primary: string; secondary: string }

function daysLeftInTrial(trialEndIso: string | null): number {
  if (!trialEndIso) return 0
  return Math.max(0, Math.ceil((new Date(trialEndIso).getTime() - Date.now()) / 86_400_000))
}

function planPillFromRow(row: {
  plan_id: string
  status: string
  trial_end: string | null
} | null): PlanPill {
  const toSettingsBilling = "/settings?tab=billing"
  const toUpgrade = "/upgrade"
  const freePill: PlanPill = {
    to: toUpgrade,
    primary: "Free Plan",
    secondary: "Upgrade",
  }

  if (!row) return freePill

  let name = "Plan"
  try {
    name = getTier(row.plan_id as TierId).name
  } catch {
    /* unknown plan_id in DB */
  }
  const { status } = row

  if (status === "trialing" && row.plan_id !== "free") {
    const d = daysLeftInTrial(row.trial_end)
    const dayWord = d === 1 ? "day" : "days"
    return {
      to: toSettingsBilling,
      primary: `${name} Trial`,
      secondary: `${d} ${dayWord} left`,
    }
  }

  if (status === "active" && row.plan_id === "free") return freePill

  if (status === "active" && row.plan_id !== "free") {
    return { to: toSettingsBilling, primary: name, secondary: "Plan" }
  }

  if (status === "past_due" && row.plan_id !== "free") {
    return {
      to: toSettingsBilling,
      primary: `${name} Plan`,
      secondary: "Payment Failed",
    }
  }

  return freePill
}

/** Landing plan pill — subscription copy from DB; `useSubscription` invalidates when status changes. */
function PlanBadgeContent() {
  const { status: ctxStatus } = useSubscription()
  const [pill, setPill] = useState<PlanPill>({
    to: "/upgrade",
    primary: "Free Plan",
    secondary: "Upgrade",
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setPill(planPillFromRow(null))
        return
      }

      const { data } = await supabase
        .from("user_subscriptions")
        .select("plan_id, status, trial_end")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .maybeSingle<{ plan_id: string; status: string; trial_end: string | null }>()

      if (cancelled) return
      setPill(planPillFromRow(data ?? null))
    })()

    return () => {
      cancelled = true
    }
  }, [ctxStatus])

  return (
    <Link to={pill.to} className="contents">
      <span className="plan-badge-lead">
        <span className="plan-badge-plan">{pill.primary}</span>
        <span className="plan-badge-dot" aria-hidden>
          ·
        </span>
      </span>
      <span className="plan-badge-upgrade">{pill.secondary}</span>
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
            aria-label="Lectura.ai — home"
          >
            <span className="font-fraunces text-[1.2rem] font-semibold leading-none tracking-[-0.03em] text-foreground antialiased max-md:text-[1.15rem] md:text-[1.35rem] [font-feature-settings:'kern'_1,'liga'_1]">
              Lectura
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
