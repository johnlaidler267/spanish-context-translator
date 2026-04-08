-- Run in Supabase SQL Editor (prod or snapshot) before deploying identity_required
-- guards on billing edge functions. If this returns rows, decide support / grandfather
-- handling before blocking anonymous checkout.
--
-- Requires auth.users.is_anonymous (Supabase GoTrue anonymous sign-in).

select
  u.id,
  u.is_anonymous,
  u.email,
  s.plan_id,
  s.status,
  s.stripe_subscription_id
from auth.users u
join public.user_subscriptions s
  on s.user_id = u.id
  and s.archived_at is null
where coalesce(u.is_anonymous, false) = true
  and (
    s.plan_id is distinct from 'free'
    or s.stripe_subscription_id is not null
  );
