-- =============================================================================
-- Migration: 0017_user_epub_library
-- Description: Personal EPUB library -- lets a signed-in (including anonymous/guest)
-- user keep books they've uploaded and come back to them later, instead of the
-- existing upload flow (src/lib/epub/parse-epub.ts) being a one-off "upload, read
-- once, gone" trip through the translator.
--
-- Storage choice: this table stores the EPUB's *extracted plain text* (the same
-- string parse-epub.ts already produces client-side for the reading pipeline),
-- not the original .epub binary. That mirrors how `discover_items.body_text`
-- already stores catalog content in this schema (see 0012_discover_catalog.sql)
-- rather than in Supabase Storage -- one pattern for "text content that needs to
-- be read back into the translator", no separate Storage bucket/RLS/signed-URL
-- surface to maintain for what is, after parsing, just text. The tradeoff: the
-- original file's formatting/images and any un-parsed metadata are not
-- recoverable from a saved library entry, only the plain text parse-epub.ts
-- already extracts today.
--
-- Two safety caps, both enforced server-side (a client-side check alone could be
-- bypassed by calling the API directly):
--   - `body_text` is capped at 2,000,000 characters/row (see the CHECK below) --
--     generous relative to even a very long novel (Cien años de soledad's full
--     Spanish text is well under 1M chars), while keeping a single row bounded.
--   - Row count per user is capped at 50 (see the trigger below) -- keeps a
--     runaway/scripted uploader from growing one user's storage unbounded.
-- Both numbers are a judgment call for a v1; revisit if real usage needs differ.
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

create table public.user_epubs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  -- Book title -- from the EPUB's OPF <dc:title> when parse-epub.ts found one,
  -- else the client falls back to the uploaded file's name (minus extension).
  title         text not null,

  -- Original uploaded filename, kept purely for display when `title` had to
  -- fall back to it and as a human-readable trace of what was uploaded.
  file_name     text not null,

  -- Extracted plain text (see module comment above) -- what gets fed back into
  -- the translate/reading pipeline (same shape handleTextSubmit already takes
  -- for a pasted article; see src/App.tsx).
  body_text     text not null check (char_length(body_text) <= 2000000),

  -- Denormalized character count so the library list can show book length
  -- without pulling the (potentially large) body_text column for every row.
  char_count    integer not null check (char_count >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Powers "this user's library, most recently added first".
create index idx_user_epubs_user_created
  on public.user_epubs (user_id, created_at desc);

create trigger trg_user_epubs_updated_at
  before update on public.user_epubs
  for each row execute procedure public.set_updated_at();

-- Per-user row cap (see module comment) -- a CHECK constraint can't see other
-- rows, so this needs a trigger instead.
create or replace function public.enforce_user_epub_library_limit()
returns trigger
language plpgsql
as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count
  from public.user_epubs
  where user_id = new.user_id;

  if existing_count >= 50 then
    raise exception 'Your library is full (max 50 books). Delete a book before adding another.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_user_epubs_limit
  before insert on public.user_epubs
  for each row execute procedure public.enforce_user_epub_library_limit();

-- ─── RLS: user_epubs ────────────────────────────────────────────────────────
-- Same policy shape as reading_progress (0016) -- users (including anonymous/guest
-- sessions, which still carry a real auth.uid()) only ever see or touch their own
-- rows. No update policy: nothing in the app updates a saved library entry today
-- (each upload is a fresh row) -- add one if/when a rename feature needs it.
alter table public.user_epubs enable row level security;

create policy "Users can read their own epub library"
  on public.user_epubs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert into their own epub library"
  on public.user_epubs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete from their own epub library"
  on public.user_epubs
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.user_epubs is
  'Per-user personal EPUB library: extracted plain text of books a user has uploaded, so they can be relisted and reopened later. Reading position for a given book lives in reading_progress, keyed by this table''s id as content_id. See src/lib/storage/epub-library.ts.';
