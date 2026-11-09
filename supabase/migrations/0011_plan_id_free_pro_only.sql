-- =============================================================================
-- Migration: 0011_plan_id_free_pro_only
-- Description: Remove the `unlimited` plan from the enum; merge existing
--              unlimited rows into `pro` (single paid tier: Free + Pro).
-- =============================================================================

-- Point legacy Unlimited subscribers at Pro before we drop the enum value.
update public.user_subscriptions
set plan_id = 'pro'
where plan_id = 'unlimited';

create type public.plan_id_new as enum ('free', 'pro');

-- active_subscriptions (0001) depends on plan_id, and Postgres refuses to change
-- a column's type while a view reads it. Drop it here and recreate it below with
-- the exact column list it had on the live database (the original `select *`
-- was frozen to these columns when 0001 ran).
drop view public.active_subscriptions;

alter table public.user_subscriptions
  alter column plan_id drop default,
  alter column plan_id type public.plan_id_new using (plan_id::text::public.plan_id_new);

drop type public.plan_id;

alter type public.plan_id_new rename to plan_id;

-- Set the default only after the rename, so 'free'::plan_id resolves to the new type.
alter table public.user_subscriptions
  alter column plan_id set default 'free'::public.plan_id;

create view public.active_subscriptions as
  select id, user_id, plan_id, billing_interval, stripe_customer_id,
         stripe_subscription_id, status, current_period_start, current_period_end,
         trial_start, trial_end, cancel_at_period_end, canceled_at,
         cancellation_reason, archived_at, created_at, updated_at
  from public.user_subscriptions
  where archived_at is null;

comment on view public.active_subscriptions
  is 'Non-archived subscriptions only. Use this view for all application queries.';
