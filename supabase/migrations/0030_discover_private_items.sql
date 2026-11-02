-- =============================================================================
-- Migration: 0030_discover_private_items
-- Description: Lets a curator mark a Discover item private, so copyrighted
--   texts can live in the catalog for the owner's own reading without being
--   shown to (or readable by) anyone else.
--
-- Why RLS and not a client filter: discover_items was readable by everyone
-- (`using (true)`), so hiding private rows in the app alone would still leave
-- their full body_text one Supabase query away. The select policy below is
-- what actually keeps them out of other users' hands.
--
-- "Private" means visible only to discover_curators -- today that's just the
-- owner's account (see 0023). Granting someone else curator access would also
-- let them see private items.
--
-- translation_cache rows for a private item carry its translated text, and
-- were readable by anyone too, so their select policy now follows the item's
-- own visibility (the subquery runs under the caller's discover_items RLS).
-- =============================================================================

alter table public.discover_items
  add column if not exists is_private boolean not null default false;

drop policy if exists "Anyone can read discover items" on public.discover_items;
drop policy if exists "Anyone can read public discover items" on public.discover_items;
create policy "Anyone can read public discover items"
  on public.discover_items
  for select
  using (
    not is_private
    or exists (select 1 from public.discover_curators c where c.user_id = auth.uid())
  );

drop policy if exists "Anyone can read translation cache rows" on public.translation_cache;
drop policy if exists "Anyone can read translation cache rows for visible items" on public.translation_cache;
create policy "Anyone can read translation cache rows for visible items"
  on public.translation_cache
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.discover_items d where d.id = discover_item_id)
  );
