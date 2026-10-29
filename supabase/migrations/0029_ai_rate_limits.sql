-- =============================================================================
-- Migration: 0029_ai_rate_limits
-- Description: Server-side abuse ceiling for the AI proxy edge functions
--              (groq-chat, gemini-chat, groq-transcribe, chunk-details,
--              chunk-memory-trick).
--
-- Why: those functions only checked for *a* Supabase JWT, and anonymous
-- sign-ins count, so anyone could mint a guest session and loop requests
-- through our Groq/Gemini keys. Free-plan limits are enforced in the browser
-- (and texts_submitted is a product metric, not a per-request one), so
-- nothing on the server bounded spend. These are fixed-window request
-- counters per user and per IP -- generous enough that no real reader hits
-- them, tight enough that a script can't run up the bill.
--
-- Changes:
--   1. ai_rate_limits table -- one row per (bucket, window). RLS on with no
--      policies: only service_role (the edge functions) can touch it.
--   2. ai_rate_limit_hit(p_checks) -- atomically increments every bucket in
--      p_checks and returns the first one now over its max (null if all are
--      within limits). Opportunistically prunes rows older than 2 days.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ai_rate_limits
-- ---------------------------------------------------------------------------
create table public.ai_rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

comment on table public.ai_rate_limits is
  'Fixed-window request counters for the AI proxy edge functions, keyed like '
  '"user:<uuid>:60" or "ip:<addr>:86400". Written only via ai_rate_limit_hit().';

alter table public.ai_rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- 2. ai_rate_limit_hit
-- ---------------------------------------------------------------------------
-- p_checks: [{ "bucket": text, "window_seconds": int, "max": int }, ...]
create or replace function public.ai_rate_limit_hit(p_checks jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c          jsonb;
  v_window   integer;
  v_start    timestamptz;
  v_count    integer;
  v_exceeded text := null;
begin
  for c in select * from jsonb_array_elements(p_checks) loop
    v_window := (c->>'window_seconds')::integer;
    v_start  := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);

    insert into public.ai_rate_limits as r (bucket, window_start, count)
    values (c->>'bucket', v_start, 1)
    on conflict (bucket, window_start) do update set count = r.count + 1
    returning r.count into v_count;

    if v_exceeded is null and v_count > (c->>'max')::integer then
      v_exceeded := c->>'bucket';
    end if;
  end loop;

  if random() < 0.01 then
    delete from public.ai_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_exceeded;
end;
$$;

revoke all on function public.ai_rate_limit_hit(jsonb) from public, anon, authenticated;
grant execute on function public.ai_rate_limit_hit(jsonb) to service_role;
