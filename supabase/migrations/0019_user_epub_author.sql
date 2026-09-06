-- =============================================================================
-- Migration: 0019_user_epub_author
-- Description: Adds the book's author to a saved library entry.
--
-- Root cause this fixes: parse-epub.ts extracted a book's <dc:title> but never
-- read its OPF `<dc:creator>` (the standard Dublin Core element EPUB author
-- metadata lives in) at all, so there was no author value anywhere in the
-- pipeline to save -- `user_epubs` had no column for it, and LibraryCard had no
-- prop for it either. This migration adds the column; parse-epub.ts and
-- src/lib/storage/epub-library.ts (in this same change) now extract and plumb
-- the value through to it.
--
-- Nullable, no backfill: an EPUB with no <dc:creator> genuinely has no author
-- to show (same "absent, not an error" treatment as `title`'s own fallback),
-- and there is no way to recover an author for rows already saved before this
-- migration -- their `author` will simply be null until the book is re-uploaded.
-- =============================================================================

alter table public.user_epubs
  add column author text;

comment on column public.user_epubs.author is
  'Book author as extracted from the EPUB OPF''s <dc:creator> by parse-epub.ts (preferring one marked opf:role="aut" when the OPF lists several creators). Null when the EPUB had no <dc:creator>, or for rows saved before this column existed.';
