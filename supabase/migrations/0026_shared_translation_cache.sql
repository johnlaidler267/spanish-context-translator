-- =============================================================================
-- Migration: 0026_shared_translation_cache
-- Shared, content-addressed translation cache for discover_items.
--
-- Whoever reads a given block of a Discover book/article/song first (the
-- "trailblazer") pays for the LLM call; the resulting chunk JSON is stored here
-- and every later reader of the same block reuses it instead of re-translating.
--
-- Rows are keyed by a hash of the exact source text of a fixed-size,
-- viewport-independent translation batch (see src/lib/translate/translation-batches.ts),
-- not by page number, so readers on different devices / window sizes (whose
-- on-screen pages differ) and readers who jump into the middle of a book all
-- land on the same rows. `model_version` (see shared-translation-cache.ts) lets a
-- prompt/model change invalidate old rows without a migration.
--
-- Only Discover catalog content is pooled: Library (user_epubs) uploads are
-- private and never written here.
--
-- Trust model: translation runs in the browser, so the server can't verify a
-- row is a genuine translation of its source. To keep that surface small:
--   - only signed-in, non-anonymous users can write (anyone can read);
--   - every row records who wrote it (`created_by`), so bad rows are traceable
--     and purgeable;
--   - a `ready` row is immutable -- nobody can overwrite a finished
--     translation, only fill in their own `pending` claim (or take over one
--     that's been abandoned for over a minute).
-- =============================================================================

create table public.translation_cache (
  id                uuid primary key default gen_random_uuid(),
  discover_item_id  uuid not null references public.discover_items (id) on delete cascade,
  source_hash       text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  target_lang       text not null default 'en',
  model_version     text not null check (char_length(model_version) <= 200),
  status            text not null default 'pending' check (status in ('pending', 'ready')),
  chunks            jsonb,
  source_char_len   integer not null check (source_char_len >= 0),
  created_by        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (discover_item_id, source_hash, target_lang, model_version),
  -- A ready row must carry a chunk array; cap its size so one row can't be used to park
  -- arbitrary large blobs (a real batch's chunk JSON is a few KB).
  check (status <> 'ready' or jsonb_typeof(chunks) = 'array'),
  check (chunks is null or pg_column_size(chunks) <= 262144)
);

create index idx_translation_cache_created_by
  on public.translation_cache (created_by);

create trigger trg_translation_cache_updated_at
  before update on public.translation_cache
  for each row execute procedure public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.translation_cache enable row level security;

-- Discover content is public, so its translations are too -- including for guests.
create policy "Anyone can read translation cache rows"
  on public.translation_cache
  for select
  to anon, authenticated
  using (true);

create policy "Signed-in users can add translation cache rows"
  on public.translation_cache
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- Only a still-pending row can change: its own writer filling it in, or anyone signed in
-- taking over a claim abandoned for over a minute (writer closed the tab mid-translate).
create policy "Signed-in users can fill pending translation cache rows"
  on public.translation_cache
  for update
  to authenticated
  using (
    status = 'pending'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and (created_by = auth.uid() or created_at < now() - interval '1 minute')
  )
  with check (created_by = auth.uid());

comment on table public.translation_cache is
  'Cross-user translation cache for Discover content, keyed by a hash of each fixed-size translation batch''s source text. First reader of a batch writes it; everyone after reuses it. See src/lib/translate/shared-translation-cache.ts.';
