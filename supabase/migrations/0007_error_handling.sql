-- =============================================================================
-- Migration: 0007_error_handling
-- Description: Adds infrastructure for webhook retry/dead-letter processing
--              and past_due grace-period tracking.
--
-- Changes:
--   1. webhook_event_status enum — add 'dead_letter' for events that exhausted
--      all retries and were never successfully processed.
--
--   2. webhook_events — add retry_count and last_retry_at so the
--      replay-failed-webhooks function can implement exponential back-off and
--      cap the number of replay attempts.
--
--   3. user_subscriptions.past_due_since — records the timestamp when the
--      subscription first became past_due. Used by enforce-limits and
--      track-usage to apply a configurable grace period before downgrading
--      access to free-tier limits.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend webhook_event_status enum with 'dead_letter'
-- ---------------------------------------------------------------------------
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction that has already
-- modified the type's table, so we use a DO block with a guard.
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'dead_letter'
      and enumtypid = 'public.webhook_event_status'::regtype
  ) then
    alter type public.webhook_event_status add value 'dead_letter';
  end if;
end;
$$;

comment on type public.webhook_event_status is
  'received → processing started; processed → success; failed → handler threw;'
  ' skipped → duplicate / unhandled type; dead_letter → exceeded retry limit.';

-- ---------------------------------------------------------------------------
-- 2. webhook_events — retry tracking columns
-- ---------------------------------------------------------------------------
alter table public.webhook_events
  add column if not exists retry_count    integer     not null default 0,
  add column if not exists last_retry_at  timestamptz;

comment on column public.webhook_events.retry_count is
  'Number of replay attempts made by replay-failed-webhooks. Capped at '
  'MAX_RETRIES (3 by default); events that reach the cap are marked dead_letter.';

comment on column public.webhook_events.last_retry_at is
  'Timestamp of the most recent replay attempt. NULL = never retried.';

-- Index for the replay function: find failed events that still have retries left
create index if not exists idx_webhook_events_retryable
  on public.webhook_events (status, retry_count, created_at)
  where status = 'failed';

-- ---------------------------------------------------------------------------
-- 3. user_subscriptions — past_due_since
-- ---------------------------------------------------------------------------
alter table public.user_subscriptions
  add column if not exists past_due_since timestamptz;

comment on column public.user_subscriptions.past_due_since is
  'Set when the subscription first transitions to past_due (invoice.payment_failed). '
  'Used alongside PAST_DUE_GRACE_DAYS to decide whether to enforce free-tier limits. '
  'Cleared (set to NULL) when status recovers to active (invoice.payment_succeeded).';
