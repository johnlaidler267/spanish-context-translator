/**
 * Client-side helpers for the beta Pro grants admin panel (see
 * supabase/migrations/0025_beta_pro_grants.sql and the admin-beta-grant edge
 * function). Curators can read the list directly under RLS; adding/removing
 * a grant goes through the edge function so an email that already has an
 * account gets activated/downgraded immediately, not just queued for a
 * signup that may never come.
 */
import { supabase } from "@/lib/supabase"

export interface BetaProGrant {
  email: string
  note: string | null
  createdAt: string
  claimedAt: string | null
}

export async function listBetaProGrants(): Promise<BetaProGrant[]> {
  const { data, error } = await supabase
    .from("beta_pro_grants")
    .select("email, note, created_at, claimed_at")
    .order("created_at", { ascending: false })
    .returns<{ email: string; note: string | null; created_at: string; claimed_at: string | null }[]>()

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    email: row.email,
    note: row.note,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
  }))
}

const FUNCTION_NAME = "admin-beta-grant"

async function callAdminBetaGrant(
  body: { action: "grant" | "revoke"; email: string; note?: string },
): Promise<{ alreadyActivated: boolean }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("You must be signed in.")

  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    },
    body: JSON.stringify(body),
  })

  let payload: { ok?: boolean; error?: string; alreadyActivated?: boolean }
  try {
    payload = await res.json()
  } catch {
    throw new Error(`Server error (HTTP ${res.status})`)
  }
  if (!res.ok || payload.error) {
    throw new Error(payload.error ?? `Unexpected error (HTTP ${res.status})`)
  }

  return { alreadyActivated: payload.alreadyActivated ?? false }
}

/** Grants (or re-grants) Pro to an email. Activates immediately if that email already has an account. */
export async function grantBetaPro(email: string, note?: string): Promise<{ alreadyActivated: boolean }> {
  return callAdminBetaGrant({ action: "grant", email: email.trim().toLowerCase(), note })
}

/** Removes a grant. Downgrades the account back to free if it had already been activated. */
export async function revokeBetaPro(email: string): Promise<void> {
  await callAdminBetaGrant({ action: "revoke", email: email.trim().toLowerCase() })
}
