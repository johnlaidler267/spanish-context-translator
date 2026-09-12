"use client"

/**
 * Everything the reading screen renders, behind one module so it builds into a single
 * lazily-loaded chunk (see reading-surface-lazy.tsx, which is what App.tsx actually
 * imports). Nothing here is reachable until a reader has started a translation or
 * resumed a book, so none of it belongs in the bundle the landing page has to parse
 * before it can paint.
 *
 * Import from here only through reading-surface-lazy.tsx — a static import anywhere
 * else pulls the whole chunk back into the main bundle and silently undoes the split.
 */

export { ReadingHeader } from "@/components/reading/reading-header"
export { ArticleContent } from "@/components/reading/article-content"
export { ReadMode } from "@/components/reading/read-mode"
export { WhereYouLeftOffModal } from "@/components/reading/where-you-left-off-modal"
