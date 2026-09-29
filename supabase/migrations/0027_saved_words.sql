-- =============================================================================
-- Migration: 0027_saved_words
-- Description: Words/phrases a reader saves from the word-details sheet, synced
-- across devices and listed on the Words page (src/pages/words.tsx).
--
-- One row per (user, learning language, word). The client saves the chunk's
-- gloss and the sentence it was read in, so the list is useful on its own
-- without re-running the model. Anonymous/guest sessions are asked to sign in
-- before saving (see src/lib/saved-words.ts), so rows belong to real accounts.
--
-- Idempotent (if not exists / drop policy if exists): it was first applied by hand in the
-- Supabase SQL editor, so a later `supabase db push` may run it again.
-- =============================================================================

create table if not exists public.saved_words (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- LearningLanguage in src/lib/storage/language-learning-preferences.ts ("spanish", "french", ...).
  -- The Words page lists only the current learning language's words.
  language      text not null check (char_length(language) between 1 and 32),

  -- The chunk as shown in the details sheet header (a word or a short multi-word phrase).
  word          text not null check (char_length(word) between 1 and 200),
  meaning       text check (meaning is null or char_length(meaning) <= 1000),
  literal       text check (literal is null or char_length(literal) <= 1000),

  -- The sentence the word was read in, and the book/article title when known.
  sentence      text check (sentence is null or char_length(sentence) <= 1000),
  source_title  text check (source_title is null or char_length(source_title) <= 300),

  created_at    timestamptz not null default now()
);

-- One row per (user, language, word) -- also the upsert conflict target, so saving the same
-- word twice keeps a single entry.
create unique index if not exists idx_saved_words_user_language_word
  on public.saved_words (user_id, language, word);

-- Powers the Words page (newest first, per language).
create index if not exists idx_saved_words_user_language_created
  on public.saved_words (user_id, language, created_at desc);

-- ─── RLS: saved_words ───────────────────────────────────────────────────────
alter table public.saved_words enable row level security;

drop policy if exists "Users can read their own saved words" on public.saved_words;
create policy "Users can read their own saved words"
  on public.saved_words
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own saved words" on public.saved_words;
create policy "Users can insert their own saved words"
  on public.saved_words
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved words" on public.saved_words;
create policy "Users can update their own saved words"
  on public.saved_words
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved words" on public.saved_words;
create policy "Users can delete their own saved words"
  on public.saved_words
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.saved_words is
  'Words a reader saved from the word-details sheet, per (user_id, language, word). See src/lib/saved-words.ts.';
