-- =============================================================================
-- Migration: 0015_comp_pro_grant_dev_account
-- Description: Permanently grants Pro-tier access to one developer/test
--   account (adudenamedjohnny@gmail.com) with no real Stripe subscription
--   behind it.
--
-- Why this shape: a client-side promo code was considered and rejected —
-- any code shipped to the browser bundle is visible to every user and could
-- be copied to unlock Pro for free. Instead this writes an ordinary
-- user_subscriptions row (same shape a real Stripe-backed row would have,
-- just with no stripe_customer_id / stripe_subscription_id) for the single
-- user_id resolved server-side from auth.users by email. Every place that
-- already reads user_subscriptions — checkSubscriptionStatus() on the
-- client, and enforce-limits.ts / track-usage on the server — treats it
-- exactly like a paid subscription. No application code changes, and no
-- other account or Stripe/webhook flow is touched.
--
-- Idempotent: safe to re-run (e.g. if the grant is ever reset).
-- current_period_end is set ~100 years out so the grant does not lapse;
-- since no Stripe subscription drives it, nothing will ever renew or
-- cancel it automatically.
-- =============================================================================

do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('adudenamedjohnny@gmail.com')
  limit 1;

  if target_user_id is null then
    raise notice 'comp Pro grant: no auth.users row for adudenamedjohnny@gmail.com yet -- skipping. Re-run this migration after the account has signed up.';
    return;
  end if;

  insert into public.user_subscriptions (
    user_id, plan_id, status, billing_interval,
    current_period_start, current_period_end,
    cancel_at_period_end
  )
  values (
    target_user_id, 'pro', 'active', 'monthly',
    now(), now() + interval '100 years',
    false
  )
  on conflict (user_id) where archived_at is null
  do update set
    plan_id               = 'pro',
    status                = 'active',
    current_period_start  = excluded.current_period_start,
    current_period_end    = excluded.current_period_end,
    cancel_at_period_end  = false;
end $$;
