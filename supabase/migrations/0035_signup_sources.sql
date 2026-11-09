-- =============================================================================
-- Migration: 0035_signup_sources
-- Description: Records which marketing channel brought each user to the site.
--
-- Why: links shared in posts carry a tag (lexalens.com/?ref=linkedin, or the
-- standard ?utm_source=reddit&utm_campaign=...). Without saving it, every new
-- user looks the same and there's no way to tell which channel brings readers
-- who stick around. The browser keeps the first tag it sees in localStorage
-- (src/lib/signup-source.ts) and writes it here once a session exists -- both
-- guest (anonymous) sessions and real accounts, so a guest who later signs in
-- gets a row under their real account too.
--
-- First touch wins: one row per user, never overwritten.
--
-- Idempotent (if not exists / drop policy if exists) so a re-run is harmless.
-- =============================================================================

create table if not exists public.signup_sources (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,

  -- ?ref=..., or utm_source when ref is absent. Lowercased by the client.
  source        text not null check (char_length(source) between 1 and 100),
  utm_medium    text check (utm_medium is null or char_length(utm_medium) <= 100),
  utm_campaign  text check (utm_campaign is null or char_length(utm_campaign) <= 200),

  -- Page the tagged link landed on, and the browser's referrer at that moment.
  landing_path  text check (landing_path is null or char_length(landing_path) <= 500),
  referrer      text check (referrer is null or char_length(referrer) <= 500),

  -- When the tagged visit happened (may be earlier than the row, e.g. a guest who signs in later).
  first_seen_at timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.signup_sources enable row level security;

-- Users can record and read only their own source. No update/delete: first touch is final.
drop policy if exists "signup_sources_insert_own" on public.signup_sources;
create policy "signup_sources_insert_own"
  on public.signup_sources for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "signup_sources_select_own" on public.signup_sources;
create policy "signup_sources_select_own"
  on public.signup_sources for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists idx_signup_sources_source on public.signup_sources (source);
