/**
 * Whether the current signed-in user can manage the Discover catalog (add/edit/delete
 * items, publish uploaded ebooks) — server-authoritative via the `discover_curators`
 * allowlist (see supabase/migrations/0023_restore_discover_curators.sql), not a
 * hardcoded email in the client bundle. Its RLS policy only lets a user read their own
 * row, so this can only ever resolve "am I a curator", never list other curators.
 *
 * Same shape as checkSubscriptionStatus() in lib/subscription/subscription.ts — defaults
 * to false on any error or when signed out, so a network hiccup fails closed (hides the
 * admin UI) rather than open.
 */
import { supabase } from "@/lib/supabase"

export async function checkIsDiscoverCurator(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data } = await supabase
      .from("discover_curators")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle<{ user_id: string }>()

    return data != null
  } catch {
    return false
  }
}
