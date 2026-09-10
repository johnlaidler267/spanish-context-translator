-- =============================================================================
-- Migration: 0023_restore_discover_curators
-- Description: Re-introduces a curator allowlist gating writes to
--   discover_items, and grants the repo owner's account
--   (adudenamedjohnny@gmail.com) curator access -- LexaLens board card
--   "Grant Discover curation access to account", approved by the user.
--
-- Why this exists: 0012_discover_catalog originally shipped a
-- `discover_curators` allowlist + RLS policies restricting discover_items
-- writes to curators. 0013_remove_discover_curators then dropped that table
-- and replaced the write policies with `using (true)` / `with check (true)`
-- -- i.e. ANY authenticated request (the discover_items policies have no
-- `to authenticated` restriction either, so this reads as open to anon too)
-- can currently insert/update/delete Discover catalog rows directly via the
-- Supabase client, bypassing the app entirely. That's a real, currently-live
-- gap independent of this card's own ask -- found while investigating how to
-- grant one account curator access, and fixed here as part of the same
-- change rather than filed as a separate note, since restoring the allowlist
-- is exactly what both problems need.
--
-- The admin/curator UI itself (DevEditDiscoverItemModal / DevUploadResourceModal,
-- gated by `canManageCatalog` in src/pages/discover/index.tsx) was previously
-- shown only in local dev builds (import.meta.env.DEV) -- invisible in
-- production for everyone, including the owner. That gate now also checks
-- curator status (see the accompanying src/pages/discover/index.tsx change),
-- so this table is the real, server-authoritative source of truth; the RLS
-- policies below are what actually stop a non-curator from mutating
-- discover_items regardless of what the client shows.
--
-- Idempotent: safe to re-run. If adudenamedjohnny@gmail.com hasn't signed up
-- yet in a given environment, the grant step is skipped with a notice rather
-- than failing the whole migration (same pattern as 0015).
-- =============================================================================

create table if not exists public.discover_curators (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.discover_curators enable row level security;

drop policy if exists "Users can read own discover_curator row" on public.discover_curators;
create policy "Users can read own discover_curator row"
  on public.discover_curators
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Undo 0013's open-write policies and restore curator-only writes.
drop policy if exists "Anyone can insert discover items" on public.discover_items;
drop policy if exists "Anyone can update discover items" on public.discover_items;
drop policy if exists "Anyone can delete discover items" on public.discover_items;

drop policy if exists "Curators can insert discover items" on public.discover_items;
create policy "Curators can insert discover items"
  on public.discover_items
  for insert
  to authenticated
  with check (
    exists (select 1 from public.discover_curators c where c.user_id = auth.uid())
  );

drop policy if exists "Curators can update discover items" on public.discover_items;
create policy "Curators can update discover items"
  on public.discover_items
  for update
  to authenticated
  using (
    exists (select 1 from public.discover_curators c where c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.discover_curators c where c.user_id = auth.uid())
  );

drop policy if exists "Curators can delete discover items" on public.discover_items;
create policy "Curators can delete discover items"
  on public.discover_items
  for delete
  to authenticated
  using (
    exists (select 1 from public.discover_curators c where c.user_id = auth.uid())
  );

-- Grant the one requested account curator access.
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('adudenamedjohnny@gmail.com')
  limit 1;

  if target_user_id is null then
    raise notice 'discover curator grant: no auth.users row for adudenamedjohnny@gmail.com yet -- skipping. Re-run this migration after the account has signed up.';
    return;
  end if;

  insert into public.discover_curators (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end $$;
