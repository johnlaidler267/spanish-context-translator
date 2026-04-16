import { getTier } from "@/lib/tiers"
import { subscriptionRowShowsAsFreePlan } from "@/lib/subscription-display"

export type PlanPill =
  | { mode: "link"; to: string; primary: string; secondary: string }
  | { mode: "signin"; primary: string; secondary: string }

export type LinkPlanPill = Extract<PlanPill, { mode: "link" }>

export const GUEST_PLAN_PILL: PlanPill = {
  mode: "signin",
  primary: "Sign in",
  secondary: "",
}

export function daysLeftInTrial(trialEndIso: string | null): number {
  if (!trialEndIso) return 0
  return Math.max(0, Math.ceil((new Date(trialEndIso).getTime() - Date.now()) / 86_400_000))
}

export function planPillFromRow(
  row: {
    plan_id: string
    status: string
    trial_end: string | null
  } | null,
  isAnonymous: boolean,
): LinkPlanPill {
  const toSettingsBilling = "/settings?tab=billing"
  const toUpgrade = "/upgrade"
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

/** One-line plan summary for compact UI (e.g. sidebar). */
export function formatPlanSubtitle(pill: PlanPill): string {
  if (pill.mode === "signin") return pill.primary
  const { primary, secondary } = pill
  return secondary ? `${primary} · ${secondary}` : primary
}
