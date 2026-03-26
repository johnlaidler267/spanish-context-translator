-- =============================================================================
-- Migration: 0006_trial_tracking
-- Description: Adds has_used_trial flag to prevent users from gaming free
--              trials by canceling and re-subscribing, plus a trigger that
--              sets the flag automatically when a trial starts.
--
-- Changes:
--   1. user_subscriptions.has_used_trial — boolean flag, once true stays true
--      forever for that user (even after cancellation / new subscriptions).
--      Checked by create-checkout-session before offering a trial.
--
--   2. mark_trial_used() trigger — fires BEFORE UPDATE on user_subscriptions.
--      Sets has_used_trial = true whenever trial_start transitions from NULL
--      to a non-NULL value. Once set, cannot be cleared by subsequent updates.
--
--   3. Backfill — mark existing rows that already have trial_start populated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
alter table public.user_subscriptions
  add column if not exists has_used_trial boolean not null default false;

comment on column public.user_subscriptions.has_used_trial is
  'True once this user has ever started a paid-tier trial. Set permanently by '
  'the mark_trial_used trigger; checked by create-checkout-session to prevent '
  'repeat trials on the same account.';

-- ---------------------------------------------------------------------------
-- 2. Trigger: mark has_used_trial when trial_start is first set
-- ---------------------------------------------------------------------------
create or replace function public.mark_trial_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Activate the flag as soon as trial_start appears for the first time.
  -- Once true, never allow it to be cleared back to false.
  if new.trial_start is not null then
    new.has_used_trial = true;
  elsif old.has_used_trial = true then
    -- Preserve the flag even if trial_start is later set to null
    -- (e.g. some unexpected update). It's a permanent record.
    new.has_used_trial = true;
  end if;

  return new;
end;
$$;

create trigger trg_mark_trial_used
  before update on public.user_subscriptions
  for each row execute function public.mark_trial_used();

-- ---------------------------------------------------------------------------
-- 3. Backfill — flag users who already went through a trial
-- ---------------------------------------------------------------------------
update public.user_subscriptions
set has_used_trial = true
where trial_start is not null
  and has_used_trial = false;
