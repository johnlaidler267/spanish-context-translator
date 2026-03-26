-- =============================================================================
-- Migration: 0005_free_tier_provisioning
-- Description: Ensures every user always has a subscription row (free tier by
--              default), adds per-day text tracking for free-tier rate limiting,
--              and updates the increment_usage RPC to handle daily counter resets.
--
-- Changes:
--   1. provision_free_tier(p_user_id) — idempotent helper: inserts a free-tier
--      subscription row for the user if one doesn't already exist. Called by
--      the auth trigger AND by the track-usage Edge Function as a lazy fallback.
--
--   2. handle_new_user() trigger — fires AFTER INSERT on auth.users. Calls
--      provision_free_tier so every new signup immediately has a usable row.
--
--   3. Backfill — inserts free-tier rows for any existing users who pre-date
--      this migration (one-time data fix).
--
--   4. usage_records columns — texts_today (int) and texts_today_date (date)
--      for daily text-submission tracking. The increment_usage RPC resets
--      texts_today whenever texts_today_date differs from the current date.
--
--   5. increment_usage v2 — drop-and-replace the function to add daily counter
--      logic. Signature is backward-compatible (all params unchanged; daily
--      reset is implicit when p_texts > 0).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. provision_free_tier — idempotent free-tier row creator
--    Uses ON CONFLICT DO NOTHING so it's always safe to call.
-- ---------------------------------------------------------------------------
create or replace function public.provision_free_tier(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_subscriptions (
    user_id,
    plan_id,
    billing_interval,
    status
  )
  values (
    p_user_id,
    'free',
    'monthly',
    'active'
  )
  on conflict do nothing;   -- unique partial index prevents duplicate active rows
end;
$$;

-- Only the service_role (Edge Functions) and postgres (trigger) need this.
revoke execute on function public.provision_free_tier from public, anon, authenticated;
grant  execute on function public.provision_free_tier to service_role;

comment on function public.provision_free_tier is
  'Idempotent: inserts a free-tier subscription row for the user if they do not '
  'already have one. Safe to call from the auth trigger and from edge functions.';

-- ---------------------------------------------------------------------------
-- 2. handle_new_user — auth trigger function
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.provision_free_tier(new.id);
  return new;
end;
$$;

-- Trigger fires once per new auth user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Backfill — free-tier rows for users who already exist
--    Runs only once at migration time. Idempotent: provision_free_tier uses
--    ON CONFLICT DO NOTHING so already-provisioned users are skipped.
-- ---------------------------------------------------------------------------
do $$
declare
  r auth.users%rowtype;
begin
  for r in select * from auth.users loop
    perform public.provision_free_tier(r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Daily counter columns on usage_records
--
--    texts_today       — submissions counted since texts_today_date
--    texts_today_date  — calendar date (UTC) the counter was last reset/updated
--
--    The increment_usage RPC resets texts_today to 0 whenever texts_today_date
--    doesn't match current_date (UTC) before applying the increment.
-- ---------------------------------------------------------------------------
alter table public.usage_records
  add column if not exists texts_today      integer not null default 0
    check (texts_today >= 0),
  add column if not exists texts_today_date date;

comment on column public.usage_records.texts_today is
  'Number of text submissions since the calendar date stored in texts_today_date (UTC). '
  'Reset to 0 by increment_usage whenever the current date differs from texts_today_date.';

comment on column public.usage_records.texts_today_date is
  'Calendar date (UTC) of the last texts_today reset/increment. '
  'NULL means no submissions have been recorded in this period yet.';

-- ---------------------------------------------------------------------------
-- 5. increment_usage v2 — drop and replace with daily-reset logic
--
--    Signature: IDENTICAL to v1 (all parameters unchanged).
--    New behavior:
--      When p_texts > 0 the function also maintains texts_today /
--      texts_today_date. On INSERT the new row starts with texts_today = p_texts
--      and texts_today_date = current_date. On UPDATE it checks whether the
--      stored date matches current_date:
--        • Same day  → increment texts_today normally.
--        • Different day (or NULL) → reset texts_today to p_texts (fresh day).
--
--    All other columns are unchanged from v1.
-- ---------------------------------------------------------------------------
drop function if exists public.increment_usage(
  uuid, uuid, timestamptz, timestamptz,
  int, int, int, bigint, int, int, jsonb
);

create function public.increment_usage(
  p_user_id         uuid,
  p_subscription_id uuid,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_texts           int     default 0,
  p_chunks          int     default 0,
  p_pages           int     default 0,
  p_chars           bigint  default 0,
  p_api_calls       int     default 0,
  p_voice_requests  int     default 0,
  p_extras          jsonb   default '{}'::jsonb
)
returns public.usage_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.usage_records;
begin
  insert into public.usage_records (
    user_id,
    subscription_id,
    period_start,
    period_end,
    texts_processed,
    chunks_returned,
    pages_processed,
    chars_processed,
    api_calls,
    voice_requests,
    extra_counters,
    texts_today,
    texts_today_date
  )
  values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    greatest(p_texts,          0),
    greatest(p_chunks,         0),
    greatest(p_pages,          0),
    greatest(p_chars,          0),
    greatest(p_api_calls,      0),
    greatest(p_voice_requests, 0),
    p_extras,
    greatest(p_texts, 0),     -- texts_today starts equal to monthly for new rows
    case when p_texts > 0 then current_date else null end
  )
  on conflict (subscription_id, period_start)
  do update set
    -- ── Monthly counters (unchanged from v1) ──────────────────────────────
    texts_processed  = usage_records.texts_processed  + greatest(excluded.texts_processed,  0),
    chunks_returned  = usage_records.chunks_returned  + greatest(excluded.chunks_returned,  0),
    pages_processed  = usage_records.pages_processed  + greatest(excluded.pages_processed,  0),
    chars_processed  = usage_records.chars_processed  + greatest(excluded.chars_processed,  0),
    api_calls        = usage_records.api_calls        + greatest(excluded.api_calls,        0),
    voice_requests   = usage_records.voice_requests   + greatest(excluded.voice_requests,   0),
    extra_counters   = (
      select jsonb_object_agg(
        key,
        coalesce((usage_records.extra_counters ->> key)::bigint, 0)
          + coalesce((excluded.extra_counters ->> key)::bigint, 0)
      )
      from jsonb_object_keys(
        usage_records.extra_counters || excluded.extra_counters
      ) as key
    ),
    -- ── Daily counter — resets when the calendar date changes (UTC) ───────
    texts_today = case
      when excluded.texts_today = 0 then
        -- p_texts was 0; leave the daily counter untouched
        usage_records.texts_today
      when usage_records.texts_today_date = current_date then
        -- Same day → accumulate
        usage_records.texts_today + greatest(excluded.texts_today, 0)
      else
        -- New day (or no prior date) → start fresh
        greatest(excluded.texts_today, 0)
    end,
    texts_today_date = case
      when excluded.texts_today > 0 then current_date
      else usage_records.texts_today_date
    end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Restore permissions (same as v1)
revoke execute on function public.increment_usage from public, anon, authenticated;
grant  execute on function public.increment_usage to service_role;

comment on function public.increment_usage is
  'v2: atomically upserts usage counters for the given subscription period. '
  'When p_texts > 0 the daily counter (texts_today) is also updated, resetting '
  'to p_texts whenever the stored texts_today_date differs from current_date (UTC).';
