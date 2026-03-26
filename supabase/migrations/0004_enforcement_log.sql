-- =============================================================================
-- Migration: 0004_enforcement_log
-- Description: Append-only log of limit enforcement decisions.
--
-- Every time an action is warned or blocked, one row is inserted here.
-- "Clean" (allowed, well under limit) outcomes are NOT logged by default —
-- the edge function can opt in via the logLevel parameter.
--
-- Useful for:
--   • Analytics: which users are hitting limits? which metrics?
--   • Support: "why was my request blocked?"
--   • Business: conversion signals for upgrade prompts
-- =============================================================================

create type public.enforcement_level as enum (
  'clean',    -- under warning threshold — only logged when logLevel='all'
  'warning',  -- 80–99 % of limit — allowed, but frontend should show nudge
  'blocked'   -- at or over limit  — request must be rejected (HTTP 402)
);

create table public.enforcement_log (
  id            uuid          primary key default gen_random_uuid(),

  -- Who triggered the check
  user_id       uuid          not null references auth.users (id) on delete cascade,

  -- Which function / action requested the check (e.g. "process-text", "chunk")
  endpoint      text          not null,

  -- Which metric was evaluated
  metric        text          not null,

  -- Outcome
  level         public.enforcement_level not null,

  -- Values at the time of the check (pre-increment snapshot)
  current_val   bigint        not null,
  proposed_inc  bigint        not null default 0,  -- what the action would add
  limit_val     bigint,                            -- null = unlimited
  tier_id       text          not null,

  -- Ratio at time of check (stored for fast percentile queries)
  -- NULL when limit_val is NULL (unlimited).
  fill_ratio    numeric(6,4),

  -- Audit
  created_at    timestamptz   not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Most common query: "show me all enforcement events for this user"
create index idx_enforcement_log_user_id
  on public.enforcement_log (user_id, created_at desc);

-- Analytics: "how many blocks happened today, by metric?"
create index idx_enforcement_log_level_metric
  on public.enforcement_log (level, metric, created_at desc)
  where level in ('warning', 'blocked');

-- Upgrade funnel: "which users hit the limit in the last 30 days?"
create index idx_enforcement_log_blocked_recent
  on public.enforcement_log (user_id, tier_id, created_at desc)
  where level = 'blocked';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Users may read their own enforcement history (useful for support / self-serve).
-- Only service_role may insert (edge functions write via service key).

alter table public.enforcement_log enable row level security;

create policy "Users can read their own enforcement log"
  on public.enforcement_log for select
  using (auth.uid() = user_id);

create policy "Service role has full access to enforcement_log"
  on public.enforcement_log for all
  using (auth.role() = 'service_role');

-- ── Comments ─────────────────────────────────────────────────────────────────

comment on table public.enforcement_log is
  'Append-only log of limit enforcement checks. '
  'Rows with level=warning were allowed but the user is approaching their cap. '
  'Rows with level=blocked were rejected — the action did not proceed.';

comment on column public.enforcement_log.fill_ratio is
  'current_val / limit_val at time of check, rounded to 4 decimal places. '
  'NULL when limit_val is NULL (unlimited tier).';

comment on column public.enforcement_log.proposed_inc is
  'How much the action would have added (e.g. char count for a submission). '
  'The check is pre-increment: current_val does NOT include this amount.';
