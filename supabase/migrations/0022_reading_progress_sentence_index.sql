-- =============================================================================
-- Migration: 0022_reading_progress_sentence_index
-- Description: Add a viewport-independent resume anchor to reading_progress.
--
-- Root cause this fixes: `page_index` alone means a different spot in the book
-- depending on which device it was saved from -- pagination is driven by how
-- much text fits that device's viewport (see
-- src/lib/reading/reading-page-measure.ts), and mobile fits far fewer words
-- per page than desktop. "Page 5" on a phone can be roughly "page 1" on a
-- laptop, so reopening a book on a different device landed on the wrong
-- content even though the row synced correctly.
--
-- `sentence_index` is a 0-based index into the sentence array
-- `splitSourceIntoSentences` produces for this content (see
-- src/lib/translate/page-split.ts) -- derived purely from the source text, so
-- it means the same spot on every device. On resume, each device paginates
-- its own freshly-built pages and independently works out which one contains
-- that sentence index (see computePageStartSentenceIndices /
-- findPageIndexForSentenceIndex), rather than trusting a page number that
-- only ever meant something on the device that saved it.
--
-- Nullable and backward compatible: rows written before this column existed
-- have `sentence_index = null`, and the client falls back to today's
-- page_index-based resume for those (see App.tsx's resume logic) -- no data
-- migration needed.
-- =============================================================================

alter table public.reading_progress
  add column sentence_index integer check (sentence_index is null or sentence_index >= 0);

comment on column public.reading_progress.sentence_index is
  'Viewport-independent resume anchor: 0-based index into the sentence array splitSourceIntoSentences produces for this content. Null for rows written before this column existed -- the client falls back to page_index for those. See src/lib/storage/reading-progress-sync.ts and src/lib/translate/page-split.ts.';
