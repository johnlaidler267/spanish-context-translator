/**
 * Edge Function: admin-beta-grant
 *
 * POST /functions/v1/admin-beta-grant
 *
 * Lets a curator comp a specific email to Pro tier -- beta testers, friends
 * and family -- including before that person has signed up. Curators can
 * already read/insert/delete beta_pro_grants rows directly (see RLS in
 * 0025_beta_pro_grants.sql); this function exists only for the one thing RLS
 * can't do from the client: looking up whether the email already has an
 * account (auth.users isn't client-readable) and, if so, activating Pro on
 * it immediately instead of leaving the grant to wait on a signup that will
 * never come, plus the matching reversal on revoke.
 *
 * Body:
 *   action   "grant" | "revoke"
 *   email    string   required
 *   note?    string   "grant" only -- stored on the grant row
 *
 * grant  → upserts the beta_pro_grants row (preserving any existing
 *          claimed_at/claimed_by), then looks up the email; if an account
 *          already exists, activates Pro on it now and marks the grant
 *          claimed.
 * revoke → deletes the grant row; if it had already been claimed, also
 *          downgrades that account back to the free tier.
 *
 * Response 200:  { ok: true, alreadyActivated: boolean }
 * Response 4xx:  { error: string, code: string }
 *
 * Error codes:
 *   not_authenticated   — missing / invalid JWT
 *   not_authorized      — caller is not a curator
 *   invalid_action       — unknown action value
 *   invalid_email        — missing / malformed email
 *   db_error             — database failure
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
 */

import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts"

const VALID_ACTIONS = ["grant", "revoke"] as const
type Action = typeof VALID_ACTIONS[number]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function err(message: string, code: string, status = 400): Response {
  return json({ error: message, code }, status)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflightRequest()
  if (req.method !== "POST")    return err("Method not allowed", "method_not_allowed", 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) return err("Supabase env missing", "config_error", 500)

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return err("Missing or malformed Authorization header", "not_authenticated", 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return err("Invalid or expired token", "not_authenticated", 401)

  const db = createClient(supabaseUrl, serviceKey)

  const { data: curatorRow } = await db
    .from("discover_curators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!curatorRow) return err("Not authorized", "not_authorized", 403)

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { action?: string; email?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return err("Invalid JSON body", "bad_request", 400)
  }

  const action = body.action as Action | undefined
  if (!action || !VALID_ACTIONS.includes(action)) {
    return err(`action must be one of: ${VALID_ACTIONS.join(", ")}`, "invalid_action")
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return err("A valid email is required", "invalid_email")
  }

  // ── grant ──────────────────────────────────────────────────────────────────
  if (action === "grant") {
    const { data: existing, error: existingError } = await db
      .from("beta_pro_grants")
      .select("email, claimed_at, claimed_by")
      .eq("email", email)
      .maybeSingle<{ email: string; claimed_at: string | null; claimed_by: string | null }>()
    if (existingError) {
      console.error("[admin-beta-grant] read error:", existingError)
      return err("Failed to read grant", "db_error", 500)
    }

    // Upsert without touching claimed_at/claimed_by if the row already exists
    // and was already claimed -- re-granting an active beta tester shouldn't
    // reset their activation record.
    const { error: upsertError } = existing
      ? await db
          .from("beta_pro_grants")
          .update({ granted_by: user.id, note: body.note ?? null })
          .eq("email", email)
      : await db
          .from("beta_pro_grants")
          .insert({ email, granted_by: user.id, note: body.note ?? null })
    if (upsertError) {
      console.error("[admin-beta-grant] upsert error:", upsertError)
      return err("Failed to save grant", "db_error", 500)
    }

    if (existing?.claimed_by) {
      // Already claimed by someone -- nothing more to activate.
      return json({ ok: true, alreadyActivated: true })
    }

    const { data: foundUserId, error: lookupError } = await db.rpc("find_user_id_by_email", {
      p_email: email,
    })
    if (lookupError) {
      console.error("[admin-beta-grant] lookup error:", lookupError)
      return err("Failed to look up account", "db_error", 500)
    }

    if (!foundUserId) {
      // No account yet -- handle_new_user() will activate this at signup time.
      return json({ ok: true, alreadyActivated: false })
    }

    const { error: activateError } = await db
      .from("user_subscriptions")
      .update({ plan_id: "pro", status: "active" })
      .eq("user_id", foundUserId)
      .is("archived_at", null)
    if (activateError) {
      console.error("[admin-beta-grant] activate error:", activateError)
      return err("Failed to activate Pro", "db_error", 500)
    }

    await db
      .from("beta_pro_grants")
      .update({ claimed_at: new Date().toISOString(), claimed_by: foundUserId })
      .eq("email", email)

    return json({ ok: true, alreadyActivated: true })
  }

  // ── revoke ─────────────────────────────────────────────────────────────────
  const { data: grantRow, error: grantError } = await db
    .from("beta_pro_grants")
    .select("claimed_by")
    .eq("email", email)
    .maybeSingle<{ claimed_by: string | null }>()
  if (grantError) {
    console.error("[admin-beta-grant] read error:", grantError)
    return err("Failed to read grant", "db_error", 500)
  }

  if (grantRow?.claimed_by) {
    const { error: downgradeError } = await db
      .from("user_subscriptions")
      .update({ plan_id: "free", status: "active" })
      .eq("user_id", grantRow.claimed_by)
      .is("archived_at", null)
    if (downgradeError) {
      console.error("[admin-beta-grant] downgrade error:", downgradeError)
      return err("Failed to downgrade account", "db_error", 500)
    }
  }

  const { error: deleteError } = await db.from("beta_pro_grants").delete().eq("email", email)
  if (deleteError) {
    console.error("[admin-beta-grant] delete error:", deleteError)
    return err("Failed to remove grant", "db_error", 500)
  }

  return json({ ok: true, alreadyActivated: false })
})
