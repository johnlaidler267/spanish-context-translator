-- =============================================================================
-- Migration: 0018_user_epub_cover_image
-- Description: Adds an optional cover image to a saved library book (see the
-- "Extract cover image from EPUB uploads" feature -- src/lib/epub/parse-epub.ts's
-- `extractCoverImage`), so a library card can show the book's real cover instead
-- of always falling back to the generated placeholder plate.
--
-- Storage choice: same reasoning as body_text (see 0017_user_epub_library.sql's
-- header) -- a data: URL (base64-encoded image bytes) in this table, not a
-- separate Supabase Storage bucket. A cover is small (capped well below
-- body_text's own cap) and only ever needed alongside the row it belongs to, so
-- a bucket/RLS/signed-URL surface would be more machinery than the data justifies.
--
-- Size cap: parse-epub.ts already skips (stores null, not an error) any cover
-- over 300,000 raw bytes before it's even base64-encoded -- this column's CHECK
-- is a server-side backstop at ~450,000 characters (300,000 bytes * 4/3 for
-- base64, plus room for the "data:image/...;base64," prefix and encoding
-- padding), same belt-and-suspenders reasoning as body_text's cap: a client-side
-- check alone could be bypassed by calling the API directly.
-- =============================================================================

alter table public.user_epubs
  add column cover_image text check (char_length(cover_image) <= 450000);

comment on column public.user_epubs.cover_image is
  'Book cover as a data: URL (base64), extracted from the EPUB by parse-epub.ts. Null when the EPUB had no cover, an unrecognized image type, or one over the ~300KB source-size cap -- library-card.tsx falls back to its generated placeholder cover in that case.';
