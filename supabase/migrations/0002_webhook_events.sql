-- =============================================================================
-- Migration: 0002_webhook_events
-- Description: Persistent event log for Stripe webhooks.
--
-- Purpose:
--   • Idempotency — reject duplicate Stripe event IDs at the DB level.
--   • Audit trail — every received event is stored regardless of outcome.
--   • Debugging — failed/skipped events retain their full payload and error.
-- =============================================================================

create type public.webhook_event_status as enum (
  'received',   -- inserted on arrival, before processing
  'processed',  -- handler completed without error
  'failed',     -- handler threw; error_message is set
  'skipped'     -- event type not handled or duplicate
);

create table public.webhook_events (
  id                uuid         primary key default gen_random_uuid(),

  -- Stripe event ID — unique constraint provides idempotency at the DB level.
  stripe_event_id   text         not null unique,

  -- e.g. "customer.subscription.created"
  event_type        text         not null,

  -- Processing outcome (updated after handler runs)
  status            public.webhook_event_status not null default 'received',

  -- Resolved user, if we could match one (null = unresolvable / not yet processed)
  user_id           uuid         references auth.users (id) on delete set null,

  -- Full raw Stripe event payload (jsonb for ad-hoc queries)
  payload           jsonb        not null,

  -- Error detail when status = 'failed'
  error_message     text,

  -- Timing
  processed_at      timestamptz,
  created_at        timestamptz  not null default now()
);

-- Fast lookup by event ID (idempotency check)
create index idx_webhook_events_stripe_event_id
  on public.webhook_events (stripe_event_id);

-- Filter by type for debugging ("show me all subscription.deleted events")
create index idx_webhook_events_event_type
  on public.webhook_events (event_type);

-- Filter by status ("show me all failed events")
create index idx_webhook_events_status
  on public.webhook_events (status)
  where status in ('failed', 'received');   -- partial: skip the common 'processed' rows

-- Chronological feed per user
create index idx_webhook_events_user_id
  on public.webhook_events (user_id, created_at desc)
  where user_id is not null;

-- RLS: service role only — this table should never be exposed to the client
alter table public.webhook_events enable row level security;

create policy "Service role has full access to webhook_events"
  on public.webhook_events for all
  using (auth.role() = 'service_role');

comment on table public.webhook_events is
  'Immutable event log for all received Stripe webhook calls. '
  'stripe_event_id is unique — duplicate deliveries are silently skipped. '
  'status tracks processing outcome; error_message captures failures.';

comment on column public.webhook_events.payload is
  'Full Stripe Event object as received. Retained for replay and debugging.';
