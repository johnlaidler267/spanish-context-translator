-- =============================================================================
-- Migration: 0012_discover_catalog
-- Public Discover catalog + curator allowlist for mutations.
-- =============================================================================

create type public.discover_content_type as enum (
  'book',
  'article',
  'song',
  'poem'
);

create type public.discover_difficulty as enum (
  'beginner',
  'intermediate',
  'advanced'
);

-- Same definition as 0001_subscription_management.sql (needed if 0012 runs alone).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Curators: insert your auth.users id via SQL editor (see plan).
create table public.discover_curators (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.discover_items (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  author          text not null,
  type            public.discover_content_type not null,
  difficulty      public.discover_difficulty not null,
  word_count      integer not null check (word_count >= 0),
  language        text not null,
  cover_image     text not null,
  tags            text[] not null default '{}',
  preview         text not null,
  estimated_time  text not null,
  body_text       text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_discover_items_created_at
  on public.discover_items (created_at desc);

create trigger trg_discover_items_updated_at
  before update on public.discover_items
  for each row execute procedure public.set_updated_at();

-- ─── RLS: discover_curators ─────────────────────────────────────────────────
alter table public.discover_curators enable row level security;

-- Authenticated users can see only their own row (curator self-check in the app).
create policy "Users can read own discover_curator row"
  on public.discover_curators
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ─── RLS: discover_items ────────────────────────────────────────────────────
alter table public.discover_items enable row level security;

create policy "Anyone can read discover items"
  on public.discover_items
  for select
  using (true);

create policy "Curators can insert discover items"
  on public.discover_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.discover_curators c
      where c.user_id = auth.uid()
    )
  );

create policy "Curators can update discover items"
  on public.discover_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.discover_curators c
      where c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.discover_curators c
      where c.user_id = auth.uid()
    )
  );

create policy "Curators can delete discover items"
  on public.discover_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.discover_curators c
      where c.user_id = auth.uid()
    )
  );

-- ─── Seed (body_text = preview; replace in SQL later for full texts) ─────────
insert into public.discover_items (
  id, title, author, type, difficulty, word_count, language, cover_image, tags, preview, estimated_time, body_text
) values
(
  '00000001-0000-4000-8000-000000000001',
  'The Little Prince',
  'Antoine de Saint-Exupéry',
  'book',
  'beginner',
  16500,
  'French',
  'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop',
  array['Classic', 'Fantasy', 'Philosophy']::text[],
  $s1$Once when I was six years old I saw a magnificent picture in a book, called True Stories from Nature, about the primeval forest. It was a picture of a boa constrictor in the act of swallowing an animal. Here is a copy of the drawing. In the book it said: 'Boa constrictors swallow their prey whole, without chewing it. After that they are not able to move, and they sleep through the six months that they need for digestion.'$s1$,
  '3 hours',
  $s1$Once when I was six years old I saw a magnificent picture in a book, called True Stories from Nature, about the primeval forest. It was a picture of a boa constrictor in the act of swallowing an animal. Here is a copy of the drawing. In the book it said: 'Boa constrictors swallow their prey whole, without chewing it. After that they are not able to move, and they sleep through the six months that they need for digestion.'$s1$
),
(
  '00000002-0000-4000-8000-000000000002',
  'The Road Not Taken',
  'Robert Frost',
  'poem',
  'intermediate',
  250,
  'English',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop',
  array['Nature', 'Choices', 'Classic']::text[],
  $s2$Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;

Then took the other, as just as fair,
And having perhaps the better claim,
Because it was grassy and wanted wear;$s2$,
  '5 min',
  $s2$Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;

Then took the other, as just as fair,
And having perhaps the better claim,
Because it was grassy and wanted wear;$s2$
),
(
  '00000003-0000-4000-8000-000000000003',
  'Despacito',
  'Luis Fonsi',
  'song',
  'beginner',
  420,
  'Spanish',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=600&fit=crop',
  array['Pop', 'Latin', 'Romance']::text[],
  $s3$Sí, sabes que ya llevo un rato mirándote
Tengo que bailar contigo hoy
Vi que tu mirada ya estaba llamándome
Muéstrame el camino que yo voy

Tú, tú eres el imán y yo soy el metal
Me voy acercando y voy armando el plan$s3$,
  '4 min',
  $s3$Sí, sabes que ya llevo un rato mirándote
Tengo que bailar contigo hoy
Vi que tu mirada ya estaba llamándome
Muéstrame el camino que yo voy

Tú, tú eres el imán y yo soy el metal
Me voy acercando y voy armando el plan$s3$
),
(
  '00000004-0000-4000-8000-000000000004',
  'Climate Change: A Global Challenge',
  'Nature Journal',
  'article',
  'advanced',
  2800,
  'English',
  'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=400&h=600&fit=crop',
  array['Science', 'Environment', 'Current Events']::text[],
  $s4$The Earth's climate has changed throughout history. Just in the last 800,000 years, there have been eight cycles of ice ages and warmer periods, with the end of the last ice age about 11,700 years ago marking the beginning of the modern climate era and of human civilization. Most of these climate changes are attributed to very small variations in Earth's orbit that change the amount of solar energy our planet receives.$s4$,
  '15 min',
  $s4$The Earth's climate has changed throughout history. Just in the last 800,000 years, there have been eight cycles of ice ages and warmer periods, with the end of the last ice age about 11,700 years ago marking the beginning of the modern climate era and of human civilization. Most of these climate changes are attributed to very small variations in Earth's orbit that change the amount of solar energy our planet receives.$s4$
),
(
  '00000005-0000-4000-8000-000000000005',
  'Kafka on the Shore',
  'Haruki Murakami',
  'book',
  'advanced',
  125000,
  'Japanese',
  'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=600&fit=crop',
  array['Surreal', 'Coming-of-age', 'Mystery']::text[],
  $s5$On my fifteenth birthday I ran away from home. I stuffed my belongings in a backpack, stuck it in a coin locker in a train station, and waited for the library to open. I needed to find answers. Somewhere between the rows of books, I hoped to discover who I really was, and who I might become.$s5$,
  '12 hours',
  $s5$On my fifteenth birthday I ran away from home. I stuffed my belongings in a backpack, stuck it in a coin locker in a train station, and waited for the library to open. I needed to find answers. Somewhere between the rows of books, I hoped to discover who I really was, and who I might become.$s5$
),
(
  '00000006-0000-4000-8000-000000000006',
  'Sonnet 18',
  'William Shakespeare',
  'poem',
  'intermediate',
  114,
  'English',
  'https://images.unsplash.com/photo-1474366521946-c3b0dfe4ba7e?w=400&h=600&fit=crop',
  array['Romance', 'Classic', 'Sonnets']::text[],
  $s6$Shall I compare thee to a summer's day?
Thou art more lovely and more temperate:
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date:

Sometime too hot the eye of heaven shines,
And often is his gold complexion dimm'd;$s6$,
  '3 min',
  $s6$Shall I compare thee to a summer's day?
Thou art more lovely and more temperate:
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date:

Sometime too hot the eye of heaven shines,
And often is his gold complexion dimm'd;$s6$
),
(
  '00000007-0000-4000-8000-000000000007',
  'La Vie en Rose',
  'Édith Piaf',
  'song',
  'intermediate',
  280,
  'French',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=600&fit=crop',
  array['Classic', 'Romance', 'Jazz']::text[],
  $s7$Des yeux qui font baisser les miens
Un rire qui se perd sur sa bouche
Voilà le portrait sans retouche
De l'homme auquel j'appartiens

Quand il me prend dans ses bras
Il me parle tout bas
Je vois la vie en rose$s7$,
  '4 min',
  $s7$Des yeux qui font baisser les miens
Un rire qui se perd sur sa bouche
Voilà le portrait sans retouche
De l'homme auquel j'appartiens

Quand il me prend dans ses bras
Il me parle tout bas
Je vois la vie en rose$s7$
),
(
  '00000008-0000-4000-8000-000000000008',
  'The Art of Mindfulness',
  'Zen Magazine',
  'article',
  'beginner',
  1200,
  'English',
  'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=600&fit=crop',
  array['Wellness', 'Meditation', 'Lifestyle']::text[],
  $s8$Mindfulness is the basic human ability to be fully present, aware of where we are and what we're doing, and not overly reactive or overwhelmed by what's going on around us. While mindfulness is something we all naturally possess, it's more readily available to us when we practice on a daily basis.$s8$,
  '8 min',
  $s8$Mindfulness is the basic human ability to be fully present, aware of where we are and what we're doing, and not overly reactive or overwhelmed by what's going on around us. While mindfulness is something we all naturally possess, it's more readily available to us when we practice on a daily basis.$s8$
),
(
  '00000009-0000-4000-8000-000000000009',
  'Cien años de soledad',
  'Gabriel García Márquez',
  'book',
  'advanced',
  144000,
  'Spanish',
  'https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400&h=600&fit=crop',
  array['Magic Realism', 'Epic', 'Family Saga']::text[],
  $s9$Muchos años después, frente al pelotón de fusilamiento, el coronel Aureliano Buendía había de recordar aquella tarde remota en que su padre lo llevó a conocer el hielo. Macondo era entonces una aldea de veinte casas de barro y cañabrava construidas a la orilla de un río de aguas diáfanas.$s9$,
  '14 hours',
  $s9$Muchos años después, frente al pelotón de fusilamiento, el coronel Aureliano Buendía había de recordar aquella tarde remota en que su padre lo llevó a conocer el hielo. Macondo era entonces una aldea de veinte casas de barro y cañabrava construidas a la orilla de un río de aguas diáfanas.$s9$
),
(
  '0000000a-0000-4000-8000-00000000000a',
  '99 Luftballons',
  'Nena',
  'song',
  'intermediate',
  350,
  'German',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=600&fit=crop',
  array['Pop', '80s', 'Anti-war']::text[],
  $s10$Hast du etwas Zeit für mich?
Dann singe ich ein Lied für dich
Von neunundneunzig Luftballons
Auf ihrem Weg zum Horizont

Denkst du vielleicht grad an mich?
Dann singe ich ein Lied für dich$s10$,
  '4 min',
  $s10$Hast du etwas Zeit für mich?
Dann singe ich ein Lied für dich
Von neunundneunzig Luftballons
Auf ihrem Weg zum Horizont

Denkst du vielleicht grad an mich?
Dann singe ich ein Lied für dich$s10$
),
(
  '0000000b-0000-4000-8000-00000000000b',
  'Still I Rise',
  'Maya Angelou',
  'poem',
  'intermediate',
  320,
  'English',
  'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400&h=600&fit=crop',
  array['Empowerment', 'Civil Rights', 'Modern']::text[],
  $s11$You may write me down in history
With your bitter, twisted lies,
You may trod me in the very dirt
But still, like dust, I'll rise.

Does my sassiness upset you?
Why are you beset with gloom?
'Cause I walk like I've got oil wells
Pumping in my living room.$s11$,
  '5 min',
  $s11$You may write me down in history
With your bitter, twisted lies,
You may trod me in the very dirt
But still, like dust, I'll rise.

Does my sassiness upset you?
Why are you beset with gloom?
'Cause I walk like I've got oil wells
Pumping in my living room.$s11$
),
(
  '0000000c-0000-4000-8000-00000000000c',
  'The Future of AI in Education',
  'EdTech Weekly',
  'article',
  'intermediate',
  1800,
  'English',
  'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=600&fit=crop',
  array['Technology', 'Education', 'Future']::text[],
  $s12$Artificial intelligence is revolutionizing the way we learn and teach. From personalized learning paths to intelligent tutoring systems, AI is making education more accessible and effective than ever before. This article explores the current state of AI in education and what the future might hold.$s12$,
  '10 min',
  $s12$Artificial intelligence is revolutionizing the way we learn and teach. From personalized learning paths to intelligent tutoring systems, AI is making education more accessible and effective than ever before. This article explores the current state of AI in education and what the future might hold.$s12$
);
