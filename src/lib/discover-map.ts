import type { ContentItem } from "@/lib/content-data"
import type { DiscoverItemRow } from "@/lib/db.types"

/** List / card fields (matches discover list query; no `body_text`). */
export type DiscoverListRow = Pick<
  DiscoverItemRow,
  | "id"
  | "title"
  | "author"
  | "type"
  | "difficulty"
  | "word_count"
  | "language"
  | "cover_image"
  | "tags"
  | "preview"
  | "estimated_time"
  | "created_at"
>

export function discoverRowToContentItem(row: DiscoverListRow): ContentItem {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    type: row.type,
    difficulty: row.difficulty,
    wordCount: row.word_count,
    language: row.language,
    coverImage: row.cover_image,
    tags: row.tags,
    preview: row.preview,
    estimatedTime: row.estimated_time,
  }
}
