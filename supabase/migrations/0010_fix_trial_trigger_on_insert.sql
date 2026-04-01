-- =============================================================================
-- Migration: 0010_fix_trial_trigger_on_insert
-- Description: Fire mark_trial_used on INSERT as well as UPDATE so rows
--              inserted with trial_start set get has_used_trial = true
--              immediately (0006 only hooked BEFORE UPDATE).
-- =============================================================================

drop trigger if exists trg_mark_trial_used on public.user_subscriptions;
drop trigger if exists mark_trial_used on public.user_subscriptions;

drop function if exists public.mark_trial_used();

create or replace function public.mark_trial_used_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trial_start is not null then
    new.has_used_trial := true;
  end if;
  return new;
end;
$$;

create trigger mark_trial_used
  before insert or update on public.user_subscriptions
  for each row
  execute function public.mark_trial_used_fn();

comment on function public.mark_trial_used_fn() is
  'Sets has_used_trial when trial_start is non-null. Replaces mark_trial_used(); '
  'runs on INSERT and UPDATE.';

-- Repair rows that were inserted with trial_start before this migration (trigger was UPDATE-only).
update public.user_subscriptions
set has_used_trial = true
where trial_start is not null
  and has_used_trial = false;
