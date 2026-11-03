-- =============================================================================
-- Migration: 0033_discover_open_to_guests
-- Description: Lets a curator open specific Discover books to signed-out visitors,
--   and opens the LexaLens Originals beginner stories (0031).
--
-- Why: the app sends a signed-out visitor to sign in for any "book" (only short
-- pastes were meant for the anonymous guest session), so the beginner stories we
-- want new visitors to try were behind a sign-in wall. A per-item flag keeps that
-- default for every other book while letting these short originals through.
--
-- Cost note: guests translate through the same rate-limited edge functions as
-- everyone else (see 0029 / _shared/ai-rate-limit.ts), the free book page cap
-- still applies, and these items use the shared translation cache, so repeat
-- guest reads are mostly cache hits.
-- =============================================================================

alter table public.discover_items
  add column if not exists open_to_guests boolean not null default false;

update public.discover_items
set open_to_guests = true
where id in (
  'b0000001-0000-4000-8000-000000000001',
  'b0000001-0000-4000-8000-000000000002',
  'b0000001-0000-4000-8000-000000000003',
  'b0000001-0000-4000-8000-000000000004',
  'b0000001-0000-4000-8000-000000000005'
);
