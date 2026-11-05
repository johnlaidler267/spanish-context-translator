-- =============================================================================
-- Migration: 0034_user_epub_language
-- Description: Records which language each uploaded book is written in.
--
-- Why: the Library and the landing page's Continue Reading row showed every
-- upload whatever language the reader was learning, so in French mode they'd
-- still see (and could open) their Spanish books, and reading a Spanish book in
-- French mode translates it as the wrong language. Discover items already carry
-- a language; uploads had nothing to filter on.
--
-- New uploads are tagged in the browser (src/lib/epub/detect-book-language.ts).
-- Existing ones are backfilled below with the same check: count very common
-- words only Spanish, French or English uses in the first 30,000 characters,
-- and pick a language only when it has at least 20 hits and leads the
-- runner-up by 1.5x. Books it can't call stay null, which the app treats as
-- "unknown -- show in every language", and the reader can set it by hand.
--
-- The backfill runs with the updated_at trigger off: the app keys each book's
-- saved page layout on updated_at, so bumping it would make every existing
-- book re-paginate on its next open for no reason.
-- =============================================================================

alter table public.user_epubs
  add column if not exists language text
  check (language is null or language in ('spanish', 'french', 'english'));

comment on column public.user_epubs.language is
  'Language the book is written in (spanish/french/english), detected at upload or set by the reader. Null when unknown; the app then shows the book in every language.';

alter table public.user_epubs disable trigger trg_user_epubs_updated_at;

with words as (
  select e.id, w
  from public.user_epubs e,
       lateral regexp_split_to_table(lower(left(e.body_text, 30000)), '[^[:alpha:]áéíóúüñàâçèêëîïôœùûÿ]+') as w
  where e.language is null
),
counts as (
  select id,
    count(*) filter (where w = any (array[
      'el','los','las','una','por','con','para','del','al','lo','pero','su','sus',
      'más','como','está','muy','es','fue','había','él','ella','yo','cuando','porque'])) as es,
    count(*) filter (where w = any (array[
      'le','les','et','une','des','du','qui','est','pas','ne','je','il','elle','nous',
      'vous','dans','pour','sur','avec','au','aux','ce','cette','mais','était','très'])) as fr,
    count(*) filter (where w = any (array[
      'the','and','of','to','in','is','it','that','was','he','she','with','for','his',
      'her','you','i','not','but','at','be','had','they','this','would'])) as en
  from words
  group by id
),
picked as (
  select id,
    case
      when es >= 20 and es >= 1.5 * greatest(fr, en) then 'spanish'
      when fr >= 20 and fr >= 1.5 * greatest(es, en) then 'french'
      when en >= 20 and en >= 1.5 * greatest(es, fr) then 'english'
    end as language
  from counts
)
update public.user_epubs u
set language = p.language
from picked p
where u.id = p.id and p.language is not null;

alter table public.user_epubs enable trigger trg_user_epubs_updated_at;
