-- =============================================================================
-- Migration: 0028_saved_words_practice
-- Description: Spaced-repetition state for the Practice page (src/pages/words-practice.tsx),
-- stored on each saved word so review progress follows the reader across devices.
--
-- review_stage is a Leitner-style box (0 = new / just missed, higher = known longer);
-- due_at is when the word should next come up (null = never practiced). The schedule
-- itself lives in src/lib/practice.ts.
--
-- Idempotent (if not exists), like 0027, since migrations here are applied by hand.
-- The client tolerates these columns being missing (practice still runs, progress
-- just isn't saved), so applying this after the frontend deploy is safe.
-- =============================================================================

alter table public.saved_words
  add column if not exists review_stage     smallint not null default 0
    check (review_stage between 0 and 20),
  add column if not exists due_at           timestamptz,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists review_count     integer not null default 0 check (review_count >= 0),
  add column if not exists lapse_count      integer not null default 0 check (lapse_count >= 0);

-- RLS: the existing owner-only update policy from 0027 already covers these columns.
