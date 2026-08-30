-- =============================================================================
-- Migration: 0013_remove_discover_curators
-- Drop curator allowlist and allow direct writes to discover_items.
-- =============================================================================

drop policy if exists "Users can read own discover_curator row"
  on public.discover_curators;

drop policy if exists "Curators can insert discover items"
  on public.discover_items;

drop policy if exists "Curators can update discover items"
  on public.discover_items;

drop policy if exists "Curators can delete discover items"
  on public.discover_items;

drop table if exists public.discover_curators;

create policy "Anyone can insert discover items"
  on public.discover_items
  for insert
  with check (true);

create policy "Anyone can update discover items"
  on public.discover_items
  for update
  using (true)
  with check (true);

create policy "Anyone can delete discover items"
  on public.discover_items
  for delete
  using (true);
