-- Signups and retention by marketing channel (see migration 0035_signup_sources).
-- Run in the Supabase SQL editor.
--
-- "guests" = anonymous sessions (visited, never signed in); "accounts" = real sign-ins.
-- "active_7d" = real accounts seen in the last 7 days (auth.users.last_sign_in_at is only a
-- rough proxy -- sessions refresh without a new sign-in -- so treat it as a floor).
-- "pro" = real accounts on an active/trialing Pro plan (includes comped beta grants, not only payers).
select
  s.source,
  s.utm_campaign,
  count(*) filter (where u.is_anonymous)                                   as guests,
  count(*) filter (where not u.is_anonymous)                               as accounts,
  count(*) filter (where not u.is_anonymous
                     and u.last_sign_in_at > now() - interval '7 days')    as active_7d,
  count(*) filter (where not u.is_anonymous and sub.plan_id = 'pro'
                     and sub.status in ('active', 'trialing'))             as pro,
  min(s.first_seen_at)                                                     as first_seen,
  max(s.first_seen_at)                                                     as last_seen
from public.signup_sources s
join auth.users u on u.id = s.user_id
left join public.user_subscriptions sub on sub.user_id = s.user_id
group by s.source, s.utm_campaign
order by accounts desc, guests desc;
