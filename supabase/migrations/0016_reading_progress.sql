-- =============================================================================
-- Migration: 0016_reading_progress
-- Description: Per-user, per-item reading position, synced across devices.
--
-- Previously "which page was I on for this Discover item" lived only in
-- localStorage (src/lib/storage/reading-progress-storage.ts) -- reopening the
-- same book on a different device/browser started over from the top. This
-- table gives each (user, content) pair one row the client upserts as the
-- reader moves through a piece, so any device can resume from the same spot.
-- localStorage stays in place as a fast local cache / offline fallback and
-- the source of truth for guests who don't have a session yet at all (see
-- reading-progress-storage.ts's "guest" scope) -- this table is the sync
-- layer on top of it, not a replacement.
--
-- Conflict resolution: simple last-write-wins by `updated_at`, applied
-- client-side when merging a pulled row into the local cache (see
-- reading-progress-sync.ts) -- good enough for "I read on my phone, then
-- opened my laptop", not built for concurrent same-second edits.
-- =============================================================================

-- Same definition as 0001_subscription_management.sql (needed if this migration runs alone).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.reading_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  -- Matches ContentItem.id (src/lib/discover/content-data.ts) -- a Discover catalog uuid in
  -- production, but kept as text (not a FK to discover_items) since local/dev fixtures use
  -- plain string ids too.
  content_id    text not null,

  -- 0-based article page index this reader last had open -- mirrors ProgressEntry.pageIndex
  -- in reading-progress-storage.ts.
  page_index    integer not null check (page_index >= 0),

  -- Page count the source was split into when this position was saved -- purely so a "X%
  -- through" indicator has something to divide by (landing page's Continue Reading row).
  -- Paging is viewport-dependent, so this is a rough estimate, not authoritative.
  total_pages   integer check (total_pages is null or total_pages > 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per (user, content item) -- also the upsert conflict target the client writes to.
create unique index idx_reading_progress_user_content
  on public.reading_progress (user_id, content_id);

-- Powers "N most recently read items" (landing page's Continue Reading row).
create index idx_reading_progress_user_updated
  on public.reading_progress (user_id, updated_at desc);

create trigger trg_reading_progress_updated_at
  before update on public.reading_progress
  for each row execute procedure public.set_updated_at();

-- ─── RLS: reading_progress ──────────────────────────────────────────────────
-- Users (including anonymous/guest sessions, which still carry a real auth.uid()) can only
-- ever see or touch their own rows.
alter table public.reading_progress enable row level security;

create policy "Users can read their own reading progress"
  on public.reading_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own reading progress"
  on public.reading_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own reading progress"
  on public.reading_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own reading progress"
  on public.reading_progress
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.reading_progress is
  'Cross-device reading position per (user_id, content_id). Upserted by the client as the reader pages through a Discover item; last-write-wins by updated_at. See src/lib/storage/reading-progress-sync.ts.';
