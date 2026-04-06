-- =============================================================================
-- Migration: 0010_chars_today_daily
-- Description: Daily cumulative source-character counter (UTC), parallel to
--              texts_today, for enforcing free-tier charsPerUtcDay.
-- =============================================================================

alter table public.usage_records
  add column if not exists chars_today bigint not null default 0 check (chars_today >= 0),
  add column if not exists chars_today_date date null;

comment on column public.usage_records.chars_today is
  'Source characters counted today (UTC calendar date in chars_today_date).';
comment on column public.usage_records.chars_today_date is
  'UTC date for chars_today; must match increment_usage v_today or counter resets.';

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
  v_row   public.usage_records;
  v_today date := ((now() at time zone 'utc'))::date;
  v_extras jsonb := coalesce(p_extras, '{}'::jsonb);
  v_char_inc bigint := greatest(p_chars, 0);
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
    texts_today_date,
    chars_today,
    chars_today_date
  )
  values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    greatest(p_texts,          0),
    greatest(p_chunks,         0),
    greatest(p_pages,         0),
    v_char_inc,
    greatest(p_api_calls,      0),
    greatest(p_voice_requests, 0),
    v_extras,
    greatest(p_texts, 0),
    case when p_texts > 0 then v_today else null end,
    v_char_inc,
    case when v_char_inc > 0 then v_today else null end
  )
  on conflict (subscription_id, period_start)
  do update set
    texts_processed  = usage_records.texts_processed  + greatest(excluded.texts_processed,  0),
    chunks_returned  = usage_records.chunks_returned  + greatest(excluded.chunks_returned,  0),
    pages_processed  = usage_records.pages_processed  + greatest(excluded.pages_processed,  0),
    chars_processed  = usage_records.chars_processed  + greatest(excluded.chars_processed,  0),
    api_calls        = usage_records.api_calls        + greatest(excluded.api_calls,        0),
    voice_requests   = usage_records.voice_requests   + greatest(excluded.voice_requests,   0),
    extra_counters   = coalesce(
      (
        select jsonb_object_agg(
          key,
          coalesce((usage_records.extra_counters ->> key)::bigint, 0)
            + coalesce((excluded.extra_counters  ->> key)::bigint, 0)
        )
        from jsonb_object_keys(
          coalesce(usage_records.extra_counters, '{}') ||
          coalesce(excluded.extra_counters,      '{}')
        ) as key
      ),
      '{}'::jsonb
    ),
    texts_today = case
      when excluded.texts_today = 0 then
        usage_records.texts_today
      when usage_records.texts_today_date is not distinct from v_today then
        usage_records.texts_today + greatest(excluded.texts_today, 0)
      else
        greatest(excluded.texts_today, 0)
    end,
    texts_today_date = case
      when excluded.texts_today > 0 then v_today
      else usage_records.texts_today_date
    end,
    chars_today = case
      when greatest(excluded.chars_processed, 0) = 0 then
        usage_records.chars_today
      when usage_records.chars_today_date is not distinct from v_today then
        usage_records.chars_today + greatest(excluded.chars_processed, 0)
      else
        greatest(excluded.chars_processed, 0)
    end,
    chars_today_date = case
      when greatest(excluded.chars_processed, 0) > 0 then v_today
      else usage_records.chars_today_date
    end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.increment_usage from public, anon, authenticated;
grant  execute on function public.increment_usage to service_role;

comment on function public.increment_usage is
  'Increments usage counters; daily texts_today and chars_today use UTC calendar date; '
  'extra_counters NULLs are coalesced to {}.';
