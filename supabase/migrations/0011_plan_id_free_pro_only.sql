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

alter table public.user_subscriptions
  alter column plan_id drop default,
  alter column plan_id type public.plan_id_new using (plan_id::text::public.plan_id_new);

alter table public.user_subscriptions
  alter column plan_id set default 'free'::public.plan_id;

drop type public.plan_id;

alter type public.plan_id_new rename to plan_id;
