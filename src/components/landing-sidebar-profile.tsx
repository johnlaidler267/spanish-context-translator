"use client"

import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Loader2, Settings2, User } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useSubscriptionOptional } from "@/contexts/subscription-context"
import { supabase } from "@/lib/supabase"
import {
  formatPlanSubtitle,
  planPillFromRow,
  type LinkPlanPill,
} from "@/lib/plan-pill"
import { beginRouteTransition } from "@/lib/route-transition-shell"
import { cn } from "@/lib/utils"
function PlanLineLoading() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-busy="true">
      <Loader2 className="h-3 w-3 animate-spin opacity-70" aria-hidden />
      <span className="sr-only">Loading plan</span>
    </span>
  )
}

type LandingSidebarProfileProps = {
  displayName: string
  compactRail: boolean
  onNavigate: () => void
}

export function LandingSidebarProfile({
  displayName,
  compactRail,
  onNavigate,
}: LandingSidebarProfileProps) {
  const ctxStatus = useSubscriptionOptional()?.status ?? null
  const { user, isLoading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [pill, setPill] = useState<LinkPlanPill | null>(null)
  const showPlanLine = location.pathname === "/"

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

  const letterInitial = user
    ? (displayName.trim().charAt(0) || user.email?.charAt(0) || "?").toUpperCase()
    : null

  const titleName = user
    ? displayName.trim() || (user.email?.split("@")[0] ?? "Account")
    : "Guest"

  const goToUpgrade = () => {
    beginRouteTransition(560)
    navigate("/upgrade")
  }

  const planLine = (() => {
    if (authLoading && user) return <PlanLineLoading />
    if (!user) {
      return (
        <button
          type="button"
          className="max-w-full truncate text-left text-[11px] leading-tight text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
          onClick={goToUpgrade}
        >
          Free · Guest · Upgrade
        </button>
      )
    }
    if (pill === null) return <PlanLineLoading />
    if (pill.to === "/upgrade") {
      return (
        <button
          type="button"
          className="block max-w-full truncate text-[11px] leading-snug text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
          onClick={goToUpgrade}
        >
          {formatPlanSubtitle(pill)}
        </button>
      )
    }
    return (
      <Link
        to={pill.to}
        className="block max-w-full truncate text-[11px] leading-snug text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
        onClick={onNavigate}
      >
        {formatPlanSubtitle(pill)}
      </Link>
    )
  })()

  const iconBtn =
    "group flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background text-foreground/85 outline-none focus-visible:ring-2 focus-visible:ring-ring transition-[color,background-color,transform,box-shadow] duration-200 ease-out hover:bg-muted/50 hover:text-foreground motion-safe:hover:scale-105 motion-safe:active:scale-95 motion-safe:hover:shadow-sm"

  /** Solid fill + ring so the initial stays legible on `bg-muted` in light and dark. */
  const avatarClass =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-foreground text-background text-[13px] font-semibold no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-border transition-[color,background-color,transform,box-shadow] duration-200 ease-out hover:bg-foreground/92 hover:text-background motion-safe:hover:scale-105 motion-safe:active:scale-95 motion-safe:hover:shadow-md"

  if (compactRail) {
    return (
      <div className="overflow-hidden border-t border-border/60 bg-muted px-2 py-2 font-sans transition-[background-color] duration-200 ease-out motion-safe:hover:bg-muted/90">
        <div className="flex flex-col items-center gap-2">
        <Link
          to="/settings"
          className={avatarClass}
          aria-label="Settings"
        >
            {letterInitial ?? (
              <User className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            )}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden border-t border-border/60 bg-muted px-3 py-2.5 font-sans transition-[background-color] duration-200 ease-out motion-safe:hover:bg-muted/90">
      <div className="flex items-center gap-2.5">
        <Link
          to="/settings"
          className={avatarClass}
          aria-label="Account and settings"
        >
          {letterInitial ?? (
            <User className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-semibold leading-none text-foreground">{titleName}</p>
          {showPlanLine ? planLine : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/settings"
            className={cn(iconBtn, "relative px-2")}
            aria-label="Settings and account"
          >
            <Settings2
              className="h-4 w-4 opacity-85 transition-transform duration-200 ease-out motion-safe:group-hover:rotate-12 motion-safe:group-hover:scale-110"
              strokeWidth={1.65}
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </div>
  )
}
