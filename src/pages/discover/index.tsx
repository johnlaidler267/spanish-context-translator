"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Compass, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing-shell-layout"
import { ContentTypeBadge } from "@/components/discover/content-type-badge"
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
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { discoverRowToContentItem, type DiscoverListRow } from "@/lib/discover-map"
import type { DiscoverItemInsert } from "@/lib/db.types"
import type { ContentItem, ContentType, DifficultyLevel } from "@/lib/content-data"

const LIST_SELECT =
  "id, title, author, type, difficulty, word_count, language, cover_image, tags, preview, estimated_time, created_at"

type DiscoverPageProps = {
  onStartReading: (content: ContentItem) => Promise<void> | void
}

const DISCOVER_DEV_EDIT = import.meta.env.DEV

export default function DiscoverPage({ onStartReading }: DiscoverPageProps) {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { user } = useAuth()

  const [discoverItems, setDiscoverItems] = useState<ContentItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [isCurator, setIsCurator] = useState(false)
  const [curatorResolved, setCuratorResolved] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>([])
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyLevel[]>([])
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ContentItem | null>(null)

  const showCuratorUi = curatorResolved && isCurator

  useEffect(() => {
    beginRouteTransition(560)
    return () => cancelRouteTransition()
  }, [])

  useLayoutEffect(() => {
    const goHome = () => navigate("/")
    registerNewChat(goHome)
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setListLoading(true)
      setListError(null)
      const { data, error } = await supabase
        .from("discover_items")
        .select(LIST_SELECT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
      if (cancelled) return
      if (error) {
        setListError(error.message)
        setDiscoverItems([])
      } else {
        const rows = (data ?? []) as DiscoverListRow[]
        setDiscoverItems(rows.map(discoverRowToContentItem))
      }
      setListLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setIsCurator(false)
      setCuratorResolved(true)
      return
    }
    setCuratorResolved(false)
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from("discover_curators")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (cancelled) return
      setIsCurator(!!data)
      setCuratorResolved(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

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
    setDiscoverItems((currentItems) => currentItems.filter((item) => item.id !== contentId))
    setActionError(null)
    const { data, error } = await supabase.from("discover_items").delete().eq("id", contentId).select("id")
    if (error) {
      setDiscoverItems(previous)
      setActionError(error.message)
      return false
    }
    if (!data?.length) {
      setDiscoverItems(previous)
      setActionError("Nothing was deleted. Sign in as a catalog curator, or check that this item still exists.")
      return false
    }
    return true
  }

  const handleStartReading = (content: ContentItem) => {
    void onStartReading(content)
  }

  const openDevEdit = (item: ContentItem) => {
    setEditTarget(item)
    setEditModalOpen(true)
  }

  const handleDiscoverItemSaved = (item: ContentItem) => {
    setDiscoverItems((prev) => prev.map((x) => (x.id === item.id ? item : x)))
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
    setDiscoverItems((currentItems) => [newItem, ...currentItems])
    setSelectedContent(newItem)
    setModalOpen(true)
  }

  const featuredContent = discoverItems.slice(0, 3)

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[radial-gradient(120%_85%_at_86%_-12%,rgba(201,122,90,0.16)_0%,rgba(247,243,238,0)_56%),linear-gradient(to_bottom,rgba(240,235,228,0.72)_0%,rgba(247,243,238,1)_72%)] font-sans dark:bg-[radial-gradient(120%_85%_at_86%_-12%,rgba(176,107,86,0.2)_0%,rgba(26,26,26,0)_56%),linear-gradient(to_bottom,rgba(34,34,32,0.58)_0%,rgba(26,26,26,1)_72%)]">
        <main className="mx-auto w-full max-w-7xl px-4 pb-8 pt-[calc(5rem+env(safe-area-inset-top,0px))] sm:px-6 md:pt-8 lg:px-8">
          <div className="mb-10 flex items-start justify-between gap-4 md:mb-12">
            <div>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-black md:text-4xl dark:text-foreground">
                Discover
              </h1>
              <p className="mt-2 font-sans text-base leading-relaxed text-black md:text-lg dark:text-muted-foreground">
                Browse books, articles, songs, and poems matched to your level.
              </p>
            </div>
            {showCuratorUi && (
              <Button
                variant="outline"
                className="shrink-0 rounded-none"
                onClick={() => setUploadModalOpen(true)}
              >
                <Plus className="mr-2 size-4" />
                Upload Resource
              </Button>
            )}
          </div>

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
              <section className="mb-12">
                <div className="mb-6 flex items-center gap-2">
                  <Sparkles className="size-5 shrink-0 text-accent/80" />
                  <h2 className="font-serif text-base font-semibold tracking-wide text-black md:text-lg dark:text-muted-foreground">
                    Featured for You
                  </h2>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {featuredContent.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleContentClick(item)}
                      className="group relative cursor-pointer overflow-hidden rounded-none"
                    >
                      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
                        <span className="absolute left-0 top-0 h-10 w-10 border-l-[4px] border-t-[4px] border-[#C97A5A]" />
                        <span className="absolute right-0 top-0 h-10 w-10 border-r-[4px] border-t-[4px] border-[#C97A5A]" />
                      </div>
                      <div className="aspect-[16/9] overflow-hidden">
                        <img
                          src={item.coverImage}
                          alt={item.title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-black/[0.07] via-[42%] to-transparent to-[78%] dark:from-black/45 dark:via-black/12"
                      />
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background from-0% via-background/55 via-[34%] to-transparent to-[92%] dark:via-background/50"
                      />
                      <div className="absolute bottom-0 left-0 right-0 px-6 pb-7 pt-12 sm:px-7 sm:pb-8 sm:pt-14">
                        {(DISCOVER_DEV_EDIT || showCuratorUi) && (
                          <div className="absolute right-6 top-4 flex gap-1 sm:right-7">
                            {DISCOVER_DEV_EDIT && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openDevEdit(item)
                                }}
                                className="rounded-md border border-border/60 bg-background/85 p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                aria-label={`Edit ${item.title}`}
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            )}
                            {(DISCOVER_DEV_EDIT || showCuratorUi) && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleDeleteContent(item.id)
                                }}
                                className="rounded-md border border-border/60 bg-background/85 p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                aria-label={`Delete ${item.title}`}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        <ContentTypeBadge type={item.type} size="sm" className="mb-3" />
                        <h3 className="mb-1.5 font-serif text-lg font-bold leading-snug text-black dark:text-neutral-100">
                          {item.title}
                        </h3>
                        <p className="font-serif text-xs font-normal italic text-black/90 dark:text-neutral-200">
                          {item.author}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-6">
                  <h2 className="mb-4 font-serif text-lg font-semibold tracking-wide text-black md:text-xl dark:text-muted-foreground">
                    Browse All Content
                  </h2>
                  <FilterBar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    selectedTypes={selectedTypes}
                    onTypeChange={setSelectedTypes}
                    selectedDifficulties={selectedDifficulties}
                    onDifficultyChange={setSelectedDifficulties}
                  />
                </div>

                {filteredContent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-16">
                    <div className="mb-4 rounded-full bg-secondary p-4">
                      <Compass className="size-8 text-black dark:text-muted-foreground" />
                    </div>
                    <h3 className="mb-2 font-serif text-lg font-semibold text-black dark:text-foreground">
                      No content found
                    </h3>
                    <p className="font-reading text-sm text-black dark:text-muted-foreground">
                      Try adjusting your filters or search query
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredContent.map((item) => (
                      <ContentCard
                        key={item.id}
                        content={item}
                        onClick={() => handleContentClick(item)}
                        onDelete={
                          DISCOVER_DEV_EDIT || showCuratorUi
                            ? (id) => void handleDeleteContent(id)
                            : undefined
                        }
                        onEdit={DISCOVER_DEV_EDIT ? () => openDevEdit(item) : undefined}
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
        onDevEdit={DISCOVER_DEV_EDIT && selectedContent ? () => openDevEdit(selectedContent) : undefined}
        onDeleteCatalog={
          (DISCOVER_DEV_EDIT || showCuratorUi) && selectedContent
            ? async () => {
                const ok = await handleDeleteContent(selectedContent.id)
                if (ok) handleCloseModal()
              }
            : undefined
        }
      />
      {DISCOVER_DEV_EDIT && (
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
      {showCuratorUi && (
        <DevUploadResourceModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onPublish={(resource) => void handlePublishResource(resource)}
        />
      )}
    </>
  )
}
