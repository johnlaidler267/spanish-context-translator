/**
 * Authors for the book/article titles saved words came from, for the Words page's group headings.
 *
 * Saved words only keep the title they were read under (`saved_words.source_title`), so the author
 * is looked up by that title: first in the reader's own library (`user_epubs`), then in the
 * Discover catalog (`discover_items`). Pasted text has neither, so it gets no author.
 */

import { supabase } from "@/lib/supabase"

type TitledRow = { title: string | null; author: string | null }

/** Title -> author for the given titles; the reader's own books win over Discover items. */
export function pickAuthors(
  titles: string[],
  ...sources: TitledRow[][]
): Map<string, string> {
  const wanted = new Set(titles)
  const out = new Map<string, string>()
  for (const rows of sources) {
    for (const { title, author } of rows) {
      const t = title?.trim()
      const a = author?.trim()
      if (t && a && wanted.has(t) && !out.has(t)) out.set(t, a)
    }
  }
  return out
}

export async function loadSourceAuthors(
  titles: string[],
): Promise<Map<string, string>> {
  if (titles.length === 0) return new Map()
  // Either lookup failing just means fewer authors shown.
  const [epubs, discover] = await Promise.all([
    supabase.from("user_epubs").select("title, author").in("title", titles),
    supabase.from("discover_items").select("title, author").in("title", titles),
  ])
  return pickAuthors(
    titles,
    (epubs.data ?? []) as TitledRow[],
    (discover.data ?? []) as TitledRow[],
  )
}
