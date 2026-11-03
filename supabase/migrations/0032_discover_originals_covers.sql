-- =============================================================================
-- Migration: 0032_discover_originals_covers
-- Description: Gives the LexaLens Originals stories (0031) illustrated covers.
--
-- 0031 left cover_image blank, so the cards fell back to the plain generated
-- title plate. These are small hand-drawn SVGs shipped with the app itself
-- (public/covers/), so there is no third-party image host to break or license.
-- Only fills a still-blank cover, so a curator's own cover is never replaced.
-- =============================================================================

update public.discover_items d
set cover_image = v.cover
from (values
  ('b0000001-0000-4000-8000-000000000001'::uuid, '/covers/gato-senora-rosa.svg'),
  ('b0000001-0000-4000-8000-000000000002'::uuid, '/covers/tortilla-abuela.svg'),
  ('b0000001-0000-4000-8000-000000000003'::uuid, '/covers/parapluie-rouge.svg'),
  ('b0000001-0000-4000-8000-000000000004'::uuid, '/covers/croissant-hugo.svg'),
  ('b0000001-0000-4000-8000-000000000005'::uuid, '/covers/lost-key.svg')
) as v(id, cover)
where d.id = v.id
  and d.cover_image = '';
