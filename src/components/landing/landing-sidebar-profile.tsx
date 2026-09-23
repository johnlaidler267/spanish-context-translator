"use client"

import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Loader2, LogIn, Settings2 } from "lucide-react"
import { AuthCta } from "@/components/auth/auth-cta"
import { useAuth } from "@/contexts/auth-context"
import { useSubscriptionOptional } from "@/contexts/subscription-context"
import { supabase } from "@/lib/supabase"
import {
  formatPlanSubtitle,
  planPillFromRow,
  type LinkPlanPill,
} from "@/lib/subscription/plan-pill"
import { beginRouteTransition } from "@/lib/route-transition-shell"

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
  const { user: sessionUser, isGuest, isLoading: authLoading, openAuthModal } = useAuth()
  // The anonymous guest session isn't an account — render it exactly like signed out.
  const user = isGuest ? null : sessionUser
  const navigate = useNavigate()
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

  // Both are only read past the signed-out early return below, so neither needs a guest fallback.
  const letterInitial = user
    ? (displayName.trim().charAt(0) || user.email?.charAt(0) || "?").toUpperCase()
    : null

  const titleName = displayName.trim() || user?.email?.split("@")[0] || "Account"

  const goToUpgrade = () => {
    beginRouteTransition(560)
    navigate("/upgrade")
  }

  const planLine = (() => {
    if (authLoading) return <PlanLineLoading />
    if (pill === null) return <PlanLineLoading />
    if (pill.to === "/upgrade") {
      return (
        <button
          type="button"
          className="block max-w-full appearance-none truncate border-0 bg-transparent p-0 text-left text-ui-2xs leading-snug text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
          onClick={goToUpgrade}
        >
          {formatPlanSubtitle(pill)}
        </button>
      )
    }
    return (
      <Link
        to={pill.to}
        className="block max-w-full truncate text-ui-2xs leading-snug text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
        onClick={onNavigate}
      >
        {formatPlanSubtitle(pill)}
      </Link>
    )
  })()

  const iconBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-200 ease-out hover:bg-secondary hover:text-foreground"

  /**
   * Terracotta fill keeps the initial legible against the footer surface in every theme.
   * Hover ring/glow use a literal rgba (not `ring-primary/30`) because --primary is a
   * plain hex custom property, not the rgb-triplet form Tailwind needs to generate an
   * opacity-modified utility — see the discover-modal__cta hover fix for the same issue.
   */
  const avatarClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-ui-sm font-semibold no-underline outline-none ring-2 ring-transparent focus-visible:ring-ring transition-[transform,box-shadow] duration-200 ease-out hover:shadow-[0_0_0_4px_rgba(201,122,90,0.25)] motion-safe:hover:scale-105 motion-safe:active:scale-100"

  if (compactRail) {
    return (
      <div className="overflow-hidden border-t border-border/50 px-2 py-3 font-sans">
        <div className="flex flex-col items-center">
          {user ? (
            <Link to="/settings" className={avatarClass} aria-label="Settings" title="Settings">
              {letterInitial}
            </Link>
          ) : (
            // The collapsed rail has no room for a label, so the guest gets the
            // sign-in door as an icon rather than the account avatar — which,
            // signed out, led to a settings page about nobody.
            <button
              type="button"
              onClick={() => openAuthModal()}
              className={avatarClass}
              aria-label="Sign in"
              title="Sign in"
            >
              <LogIn className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="overflow-hidden border-t border-border/50 px-3 py-3 font-sans">
        <p className="text-ui-2xs leading-snug text-muted-foreground">
          Save your place in every story.
        </p>
        <AuthCta stretch className="mt-2" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden border-t border-border/50 px-3 py-3 font-sans">
      <div className="flex items-center gap-2.5">
        <Link to="/settings" className={avatarClass} aria-label="Account and settings">
          {letterInitial}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-semibold leading-none text-foreground">{titleName}</p>
          {planLine}
        </div>
        <Link to="/settings" className={iconBtn} aria-label="Settings and account">
          <Settings2 className="h-4 w-4" strokeWidth={1.65} aria-hidden />
        </Link>
      </div>
    </div>
  )
}
