"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { ContentCard } from "@/pages/discover/content-card"
import { fetchDiscoverCatalog, readCachedDiscoverItems } from "@/lib/discover/discover-catalog"
import { getRecentlyViewedProgress } from "@/lib/storage/reading-progress-storage"
import { ensureCloudReadingProgressPulled } from "@/lib/storage/reading-progress-sync"
import type { ContentItem } from "@/lib/discover/content-data"

/** "Last 4-5 pieces of content" per the feature request. */
const MAX_CONTINUE_READING_ITEMS = 5

interface LandingContinueReadingProps {
  user: User | null
  onContinue: (content: ContentItem) => void
  /**
   * Rendered instead when there's no reading history yet, or the Discover catalog hasn't
   * loaded (e.g. a brand-new session before the background prefetch lands) — the sample
   * excerpt this row normally sits in place of, passed in by landing-screen.tsx so this
   * component owns the empty/fallback decision instead of duplicating it in the caller.
   */
  fallback: ReactNode
}

/**
 * Desktop-only "Continue Reading" row — sits where the sample excerpt normally does (see
 * landing-screen.tsx), showing the reader's most recently-viewed Discover items with a rough
 * "how far in" indicator.
 */
export function LandingContinueReading({ user, onContinue, fallback }: LandingContinueReadingProps) {
  const [catalog, setCatalog] = useState<ContentItem[]>(() => readCachedDiscoverItems() ?? [])
  // Bumped once cloud-synced progress (see reading-progress-sync.ts) has been merged into the
  // localStorage cache below, so this row also reflects progress made on another device
  // instead of only whatever this browser already knew about.
  const [syncVersion, setSyncVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Same fetchDiscoverCatalog() Discover's own page and App.tsx's background prefetch call
    // (see discover-catalog.ts) — shares the in-flight/localStorage cache rather than firing
    // a separate request, and keeps this row's covers/titles fresh once it resolves.
    void fetchDiscoverCatalog().then((result) => {
      if (cancelled || !("items" in result)) return
      setCatalog(result.items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void ensureCloudReadingProgressPulled(user).then(() => {
      if (!cancelled) setSyncVersion((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const items = useMemo(() => {
    const recent = getRecentlyViewedProgress(user, MAX_CONTINUE_READING_ITEMS)
    if (recent.length === 0 || catalog.length === 0) return []
    const byId = new Map(catalog.map((item) => [item.id, item]))
    return recent
      .map((entry) => {
        const content = byId.get(entry.contentId)
        if (!content) return null
        const percent =
          entry.totalPages && entry.totalPages > 0
            ? Math.min(100, Math.max(1, Math.round(((entry.pageIndex + 1) / entry.totalPages) * 100)))
            : null
        return { content, percent }
      })
      .filter((v): v is { content: ContentItem; percent: number | null } => v != null)
    // `syncVersion` isn't read above -- it's a deliberate recompute trigger so this memo
    // reruns once cloud-synced progress has landed in localStorage (see the effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, user, syncVersion])

  if (items.length === 0) return <>{fallback}</>

  return (
    <div className="continue-reading w-full entry-4 order-3 md:order-3 mt-0 md:mt-2 hidden md:block">
      <p className="sample-excerpt-label text-center">Continue reading</p>
      <div className="continue-reading__row">
        {items.map(({ content, percent }) => (
          <ContentCard
            key={content.id}
            content={content}
            onClick={() => onContinue(content)}
            progressPercent={percent}
          />
        ))}
      </div>
    </div>
  )
}
