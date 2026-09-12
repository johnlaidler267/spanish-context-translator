-- =============================================================================
-- Migration: 0024_reading_progress_recap
-- Description: Persist the "Where you left off" LLM recap alongside reading
--              position, so it survives a new browser/device like the position
--              already does.
--
-- Root cause this fixes: the one-sentence Gemini recap of the page the reader
-- left off on (see src/lib/translate/page-recap.ts) was written *only* to
-- localStorage (src/lib/storage/reading-recap-storage.ts). `reading_progress`
-- synced the position across devices (0016/0022) but not the recap, so signing
-- in on another browser and resuming a book found the right page with no cached
-- recap for it -- and the "Where you left off" modal silently fell back to its
-- verbatim text excerpt. The recap is the expensive half (one LLM call) and was
-- the only half that didn't travel.
--
-- Stored on the existing `reading_progress` row rather than a new table: it's
-- 1:1 with (user_id, content_id), and the client already pulls that row once
-- per session -- so this rides along on a query it was already making.
--
-- `recap_for_sentence_index` is the device-independent staleness check (same
-- anchor as `sentence_index`, but for the page *before* the resume point):
-- a recap only shows if it's still about the page the reader is resuming past.
-- `recap_for_page_index` is the fallback for content with no sentence anchor,
-- and `recap_updated_at` timestamps the recap itself, independent of
-- `updated_at` (which a plain page turn bumps) so last-write-wins merging
-- doesn't treat "someone paged forward" as "someone wrote a newer recap".
--
-- All nullable and backward compatible: rows written before this migration
-- have null recap columns and the client falls back to today's excerpt
-- behavior, exactly as it does today.
-- =============================================================================

alter table public.reading_progress
  add column recap_summary            text,
  add column recap_for_page_index     integer check (recap_for_page_index is null or recap_for_page_index >= 0),
  add column recap_for_sentence_index integer check (recap_for_sentence_index is null or recap_for_sentence_index >= 0),
  add column recap_updated_at         timestamptz;

comment on column public.reading_progress.recap_summary is
  'One-sentence English recap of the page just before this reader''s resume point, generated once by gemini-2.5-flash-lite when they left the book (see src/lib/translate/page-recap.ts). Null when no recap has been generated yet. Shown by the "Where you left off" modal; when null (or stale per the recap_for_* anchors below) the client falls back to a verbatim text excerpt.';

comment on column public.reading_progress.recap_for_page_index is
  'The 0-based page index recap_summary summarizes -- the page before the resume point at generation time. Device-specific (pagination is viewport-dependent), so only used as the staleness check when recap_for_sentence_index is null.';

comment on column public.reading_progress.recap_for_sentence_index is
  'Viewport-independent anchor for the page recap_summary is about -- same sentence-index space as sentence_index (see 0022). This is what lets a recap generated on one device still be recognized as current on another. Null when no anchor was available at generation time.';

comment on column public.reading_progress.recap_updated_at is
  'When recap_summary was last written. Separate from updated_at (bumped by every page turn) so pulling a row can tell a genuinely newer recap from an unchanged one riding along with newer progress.';
