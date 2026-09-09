-- =============================================================================
-- Migration: 0020_user_epub_description
-- Description: Adds the book's description/synopsis to a saved library entry.
--
-- Root cause this fixes: parse-epub.ts never read the OPF's optional
-- `<dc:description>` element (the standard Dublin Core field a book's back-cover
-- synopsis lives in, when a publisher included one), so there was nowhere to
-- save or show it -- the reading popup (library-preview-modal.tsx) only ever
-- showed the cover, title, and reading progress. Same gap `<dc:creator>`/author
-- had before migration 0019 -- fixed the same way, and in this same change.
--
-- Nullable, capped, no backfill: most EPUBs simply don't carry this field at
-- all (a normal "nothing to show", same treatment as title/author), and there's
-- no way to recover one for rows saved before this migration -- their
-- `description` stays null until the book is re-uploaded. Capped at ~2,000
-- characters (parse-epub.ts already truncates to that same limit via
-- `truncateForPreview` before ever sending it) as a server-side backstop
-- against a pathological OPF, same belt-and-suspenders reasoning as
-- `cover_image`'s cap in 0018.
-- =============================================================================

alter table public.user_epubs
  add column description text check (char_length(description) <= 2000);

comment on column public.user_epubs.description is
  'Book synopsis as extracted from the EPUB OPF''s optional <dc:description> by parse-epub.ts (truncated to ~2,000 characters). Null when the EPUB had none, or for rows saved before this column existed.';
