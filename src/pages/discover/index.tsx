"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Compass, Library, Plus, Sparkles } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { DiscoverLoadingState } from "@/components/discover/discover-loading-state"
import { ContentPreviewModal } from "@/components/discover/content-preview-modal"
import { DevEditDiscoverItemModal } from "@/components/discover/dev-edit-discover-item-modal"
import {
  DevUploadResourceModal,
  type DevResourceUpload,
} from "@/components/discover/dev-upload-resource-modal"
import { FilterBar } from "@/components/discover/filter-bar"
import { Button } from "@/components/ui/button"
import { ContentCard } from "@/pages/discover/content-card"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import { supabase } from "@/lib/supabase"
import { discoverRowToContentItem, type DiscoverListRow } from "@/lib/discover/discover-map"
import type { DiscoverItemInsert } from "@/lib/db-types"
import type { ContentItem, ContentType, DifficultyLevel } from "@/lib/discover/content-data"

const LIST_SELECT =
  "id, title, author, type, difficulty, word_count, language, cover_image, tags, preview, estimated_time, created_at"

// Bumped to v2: cached rows now carry `preview` — v1 entries would open the modal blank.
// localStorage (not sessionStorage): the catalog rarely changes day to day, so a fresh
// visit should paint instantly from whatever was cached last time, not show a loading
// state again just because it's a new tab/session. The list is still re-fetched in the
// background on every visit (see the effect below) and the cache updated, so new content
// still shows up -- just without blocking the first paint on it.
const DISCOVER_CACHE_KEY = "lexa.discover.catalog.v2"

type DiscoverPageProps = {
  onStartReading: (content: ContentItem) => Promise<{ blockedMessage?: string } | void> | { blockedMessage?: string } | void
}

const DISCOVER_DEV_EDIT = import.meta.env.DEV

function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="discover-heading">
      <span className="discover-heading__mark" aria-hidden>
        {icon}
      </span>
      <h2 className="discover-heading__label">{children}</h2>
      <span className="discover-heading__rule" aria-hidden />
    </div>
  )
}

function readCachedDiscoverItems(): ContentItem[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(DISCOVER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ContentItem[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCachedDiscoverItems(items: ContentItem[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify(items))
  } catch {
    /* ignore quota/private mode */
  }
}

export default function DiscoverPage({ onStartReading }: DiscoverPageProps) {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const cachedItems = useMemo(() => readCachedDiscoverItems(), [])

  const [discoverItems, setDiscoverItems] = useState<ContentItem[]>(() => cachedItems ?? [])
  const [listLoading, setListLoading] = useState(() => cachedItems == null)
  const [listError, setListError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>([])
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyLevel[]>([])
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ContentItem | null>(null)

  const canManageCatalog = DISCOVER_DEV_EDIT

  useEffect(() => {
    beginRouteTransition(560)
    return () => cancelRouteTransition()
  }, [])

  useEffect(() => {
    document.documentElement.classList.add("mobile-scroll-discover")
    return () => document.documentElement.classList.remove("mobile-scroll-discover")
  }, [])

  useLayoutEffect(() => {
    const goHome = () => navigate("/")
    registerNewChat(goHome)
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!cachedItems?.length) setListLoading(true)
      setListError(null)
      const { data, error } = await supabase
        .from("discover_items")
        .select(LIST_SELECT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
      if (cancelled) return
      if (error) {
        setListError(error.message)
      } else {
        const rows = (data ?? []) as DiscoverListRow[]
        const mapped = rows.map(discoverRowToContentItem)
        setDiscoverItems(mapped)
        writeCachedDiscoverItems(mapped)
      }
      setListLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [cachedItems])

  useEffect(() => {
    if (!selectedContent) return
    const stillExists = discoverItems.some((item) => item.id === selectedContent.id)
    if (stillExists) return
    setModalOpen(false)
    setSelectedContent(null)
  }, [discoverItems, selectedContent])

  const filteredContent = useMemo(() => {
    return discoverItems.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(item.type)
      const matchesDifficulty =
        selectedDifficulties.length === 0 || selectedDifficulties.includes(item.difficulty)

      return matchesSearch && matchesType && matchesDifficulty
    })
  }, [discoverItems, searchQuery, selectedTypes, selectedDifficulties])

  // `preview` now comes with the list load (see LIST_SELECT), so the modal opens with
  // its final content already in hand — no click-triggered fetch, no post-open resize.
  const handleContentClick = (content: ContentItem) => {
    setSelectedContent(content)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setTimeout(() => setSelectedContent(null), 200)
  }

  /** Deletes `discover_items` by primary key. Returns false if the DB removed zero rows (RLS, bad id). */
  const handleDeleteContent = async (contentId: string): Promise<boolean> => {
    const previous = discoverItems
    setDiscoverItems((currentItems) => {
      const next = currentItems.filter((item) => item.id !== contentId)
      writeCachedDiscoverItems(next)
      return next
    })
    setActionError(null)
    const { data, error } = await supabase.from("discover_items").delete().eq("id", contentId).select("id")
    if (error) {
      setDiscoverItems(previous)
      writeCachedDiscoverItems(previous)
      setActionError(error.message)
      return false
    }
    if (!data?.length) {
      setDiscoverItems(previous)
      writeCachedDiscoverItems(previous)
      setActionError("Nothing was deleted. Check that this item still exists.")
      return false
    }
    return true
  }

  const handleStartReading = (content: ContentItem) => onStartReading(content)

  const openDevEdit = (item: ContentItem) => {
    setEditTarget(item)
    setEditModalOpen(true)
  }

  const handleDiscoverItemSaved = (item: ContentItem) => {
    setDiscoverItems((prev) => {
      const next = prev.map((x) => (x.id === item.id ? item : x))
      writeCachedDiscoverItems(next)
      return next
    })
    setSelectedContent((prev) => (prev?.id === item.id ? item : prev))
    setEditModalOpen(false)
    setEditTarget(null)
  }

  const handlePublishResource = async (resource: DevResourceUpload) => {
    const estimatedMinutes = Math.max(1, Math.ceil(resource.wordCount / 200))
    const estimatedTime =
      estimatedMinutes >= 60 ? `${Math.ceil(estimatedMinutes / 60)} hours` : `${estimatedMinutes} min`
    const difficulty = resource.difficulty
    const defaultTag = resource.type[0].toUpperCase() + resource.type.slice(1)
    const normalizedTags = resource.tags.length > 0 ? resource.tags : [defaultTag]
    const preview = resource.text.slice(0, 800)

    const insert: DiscoverItemInsert = {
      title: resource.title,
      author: resource.author,
      type: resource.type,
      difficulty,
      word_count: resource.wordCount,
      language: resource.language,
      cover_image:
        resource.coverImage ??
        "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop",
      tags: normalizedTags,
      preview,
      estimated_time: estimatedTime,
      body_text: resource.text,
    }

    setActionError(null)
    const { data, error } = await supabase.from("discover_items").insert(insert).select(LIST_SELECT).single()

    if (error || !data) {
      setActionError(error?.message ?? "Could not publish.")
      return
    }

    const newItem = discoverRowToContentItem(data as DiscoverListRow)
    setDiscoverItems((currentItems) => {
      const next = [newItem, ...currentItems]
      writeCachedDiscoverItems(next)
      return next
    })
    setSelectedContent(newItem)
    setModalOpen(true)
  }

  const featuredContent = discoverItems.slice(0, 4)

  return (
    <>
      <div className="discover-scroll-surface flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] font-sans">
        {/* Header is now `stacked` (in-flow, real height) via LandingShellLayout, so this
            only needs normal content spacing -- not safe-area/header-clearance compensation
            for an overlay header that no longer exists on this page. */}
        <main className="animate-fade-in-up mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:px-8 lg:pt-12">
          <header className="discover-masthead">
            <div className="min-w-0 flex-1">
              <p className="discover-masthead__eyebrow">Descubre</p>
              <h1 className="discover-masthead__title">Discover</h1>
              <p className="discover-masthead__lede">
                Books, articles, songs, and poems — matched to the Spanish you already know.
              </p>
            </div>
            {canManageCatalog && (
              <Button variant="outline" className="discover-trigger shrink-0" onClick={() => setUploadModalOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Upload Resource
              </Button>
            )}
          </header>

          {listError && (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {listError}
            </p>
          )}
          {actionError && (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}

          {listLoading ? (
            <DiscoverLoadingState />
          ) : (
            <>
              {featuredContent.length > 0 && (
                <section className="mb-14">
                  <SectionHeading icon={<Sparkles className="size-4" aria-hidden />}>
                    Featured for you
                  </SectionHeading>
                  <div className="discover-grid discover-grid--featured">
                    {featuredContent.map((item) => (
                      <ContentCard
                        key={item.id}
                        content={item}
                        featured
                        onClick={() => handleContentClick(item)}
                        onDelete={canManageCatalog ? (id) => void handleDeleteContent(id) : undefined}
                        onEdit={canManageCatalog ? () => openDevEdit(item) : undefined}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <SectionHeading icon={<Library className="size-4" aria-hidden />}>
                  The library
                  <span className="discover-heading__count">{filteredContent.length}</span>
                </SectionHeading>

                <FilterBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  selectedTypes={selectedTypes}
                  onTypeChange={setSelectedTypes}
                  selectedDifficulties={selectedDifficulties}
                  onDifficultyChange={setSelectedDifficulties}
                />

                {filteredContent.length === 0 ? (
                  <div className="discover-empty">
                    <span className="corner corner-tl" aria-hidden />
                    <span className="corner corner-tr" aria-hidden />
                    <span className="corner corner-bl" aria-hidden />
                    <span className="corner corner-br" aria-hidden />
                    <Compass className="discover-empty__icon" aria-hidden />
                    <h3 className="discover-empty__title">Nada por aquí</h3>
                    <p className="discover-empty__text">
                      Nothing matches those filters yet. Try a different search or clear a filter.
                    </p>
                  </div>
                ) : (
                  <div className="discover-grid">
                    {filteredContent.map((item) => (
                      <ContentCard
                        key={item.id}
                        content={item}
                        onClick={() => handleContentClick(item)}
                        onDelete={canManageCatalog ? (id) => void handleDeleteContent(id) : undefined}
                        onEdit={canManageCatalog ? () => openDevEdit(item) : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <ContentPreviewModal
        content={selectedContent}
        open={modalOpen}
        onClose={handleCloseModal}
        onStartReading={handleStartReading}
        onDevEdit={canManageCatalog && selectedContent ? () => openDevEdit(selectedContent) : undefined}
        onDeleteCatalog={
          canManageCatalog && selectedContent
            ? async () => {
                const ok = await handleDeleteContent(selectedContent.id)
                if (ok) handleCloseModal()
              }
            : undefined
        }
      />
      {canManageCatalog && (
        <DevEditDiscoverItemModal
          content={editTarget}
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false)
            setEditTarget(null)
          }}
          onSaved={handleDiscoverItemSaved}
          onError={(message) => setActionError(message)}
        />
      )}
      {canManageCatalog && (
        <DevUploadResourceModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onPublish={(resource) => void handlePublishResource(resource)}
        />
      )}
    </>
  )
}
