-- =============================================================================
-- Migration: 0021_user_epub_story_start_offset
-- Description: Where the actual story starts in a saved book's `body_text`,
-- so opening it for the first time can land past the front matter (title
-- page, copyright, dedication, table of contents, ...) instead of at
-- character 0 of it.
--
-- Root cause this fixes: most EPUBs -- especially trade-published ones --
-- carry several pages of front matter before the real content, none of it
-- worth translating. parse-epub.ts now detects where that ends (preferring
-- the EPUB's own OPF `<guide>` "text" reference when present, falling back
-- to a short-chapter/conventional-filename heuristic otherwise -- see
-- `detectStoryStartIndex`'s docstring) and returns it as a character offset
-- into the parsed text. This column persists that offset alongside the book
-- so it survives being saved and reopened later.
--
-- Non-destructive: this never removes or hides the front matter, only
-- changes where a *first-ever* read of the book lands -- src/App.tsx's
-- handleLibraryStartReading only consults this when there's no saved
-- reading_progress row yet for the book, and paging back to the very first
-- page always reaches it. `0` (the default) means "no skip", same
-- as every book saved before this column existed -- there's no way to
-- retroactively detect a story start for those without re-parsing the
-- original file, which the app doesn't keep (see 0017's module comment).
-- =============================================================================

alter table public.user_epubs
  add column story_start_offset integer not null default 0
  check (story_start_offset >= 0 and story_start_offset <= char_count);

comment on column public.user_epubs.story_start_offset is
  'Character offset into body_text where the actual story appears to start, as detected by parse-epub.ts''s detectStoryStartIndex (0 = no front matter detected, or a book saved before this column existed). Consulted by src/App.tsx''s handleLibraryStartReading only when the reader has no saved reading_progress for this book yet -- never removes or hides anything, just changes the default landing page on a first-ever open.';
