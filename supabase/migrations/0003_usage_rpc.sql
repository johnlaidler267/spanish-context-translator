-- =============================================================================
-- Migration: 0003_usage_rpc
-- Description: Adds extra_counters JSONB column to usage_records for future
--              metrics without schema changes, and creates the increment_usage
--              RPC used by the track-usage Edge Function.
--
-- Design:
--   Fixed columns  — the 6 original metrics (texts, chunks, pages, chars,
--                    api_calls, voice_requests). Best query/index performance.
--   extra_counters — JSONB overflow for any future metric. Adding a new metric
--                    is a config-only change until/unless you promote it to a
--                    dedicated column for performance.
--
--   increment_usage() — atomic upsert-with-increment. Inserts a new row at the
--   start of each billing period; subsequent calls within the same period only
--   increment. Safe to call concurrently (uses ON CONFLICT DO UPDATE which is
--   atomic inside Postgres).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add extra_counters column to usage_records
-- ---------------------------------------------------------------------------
alter table public.usage_records
  add column if not exists extra_counters jsonb not null default '{}'::jsonb;

comment on column public.usage_records.extra_counters is
  'Overflow bucket for metrics that do not yet have a dedicated column. '
  'Keys are metric names; values are bigint-compatible integers. '
  'Promotes to a dedicated column when query performance requires it.';

-- ---------------------------------------------------------------------------
-- 2. increment_usage — atomic period upsert + counter increment
--
-- Parameters
--   p_user_id          — auth.users.id
--   p_subscription_id  — user_subscriptions.id
--   p_period_start     — billing period start (determines which row to target)
--   p_period_end       — billing period end
--   p_texts            — increment for texts_processed  (0 = no change)
--   p_chunks           — increment for chunks_returned
--   p_pages            — increment for pages_processed
--   p_chars            — increment for chars_processed
--   p_api_calls        — increment for api_calls
--   p_voice_requests   — increment for voice_requests
--   p_extras           — JSONB map of extra metric increments
--                        e.g. '{"exports": 1, "custom_metric": 3}'
--
-- Returns the updated usage_records row (post-increment values).
-- ---------------------------------------------------------------------------
create or replace function public.increment_usage(
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
security definer   -- runs as the function owner (postgres), bypasses RLS
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
    extra_counters
  )
  values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    greatest(p_texts, 0),
    greatest(p_chunks, 0),
    greatest(p_pages, 0),
    greatest(p_chars, 0),
    greatest(p_api_calls, 0),
    greatest(p_voice_requests, 0),
    p_extras
  )
  on conflict (subscription_id, period_start)
  do update set
    texts_processed  = usage_records.texts_processed  + greatest(excluded.texts_processed,  0),
    chunks_returned  = usage_records.chunks_returned  + greatest(excluded.chunks_returned,  0),
    pages_processed  = usage_records.pages_processed  + greatest(excluded.pages_processed,  0),
    chars_processed  = usage_records.chars_processed  + greatest(excluded.chars_processed,  0),
    api_calls        = usage_records.api_calls        + greatest(excluded.api_calls,        0),
    voice_requests   = usage_records.voice_requests   + greatest(excluded.voice_requests,   0),
    -- Merge extra_counters: for each key in the increment map, add its value
    -- to the existing value (defaulting to 0 if the key is new).
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
    updated_at       = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. get_current_usage — read current-period counters without incrementing
--
-- Returns the usage_records row for the given subscription + period, or null.
-- Useful for displaying "X of Y used" to the user.
-- ---------------------------------------------------------------------------
create or replace function public.get_current_usage(
  p_subscription_id uuid,
  p_period_start    timestamptz
)
returns public.usage_records
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.usage_records
  where subscription_id = p_subscription_id
    and period_start    = p_period_start
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permissions — only service_role (Edge Functions) can call these
-- ---------------------------------------------------------------------------
revoke execute on function public.increment_usage from public, anon, authenticated;
grant  execute on function public.increment_usage to service_role;

revoke execute on function public.get_current_usage from public, anon, authenticated;
grant  execute on function public.get_current_usage to service_role;
