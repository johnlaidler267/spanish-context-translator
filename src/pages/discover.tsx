"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Compass, Sparkles } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing-shell-layout"
import { ContentPreviewModal } from "@/components/discover/content-preview-modal"
import { FilterBar } from "@/components/discover/filter-bar"
import { ContentCard } from "@/pages/discover/content-card"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import {
  contentItems,
  type ContentItem,
  type ContentType,
  type DifficultyLevel,
} from "@/lib/content-data"

export default function DiscoverPage() {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>([])
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyLevel[]>([])
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    beginRouteTransition(560)
    return () => cancelRouteTransition()
  }, [])

  useLayoutEffect(() => {
    const goHome = () => navigate("/")
    registerNewChat(goHome)
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  const filteredContent = useMemo(() => {
    return contentItems.filter((item) => {
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
  }, [searchQuery, selectedTypes, selectedDifficulties])

  const handleContentClick = (content: ContentItem) => {
    setSelectedContent(content)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setTimeout(() => setSelectedContent(null), 200)
  }

  const featuredContent = contentItems.slice(0, 3)

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background font-sans">
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-10 md:mb-12">
            <h1 className="bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-100 bg-clip-text font-serif text-3xl font-medium text-transparent md:text-4xl dark:from-neutral-400 dark:via-neutral-200 dark:to-white">
              Discover
            </h1>
            <p className="mt-2 font-reading text-base leading-relaxed text-muted-foreground md:text-lg">
              Browse books, articles, songs, and poems matched to your level.
            </p>
          </div>

          <section className="mb-12">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles className="size-5 shrink-0 text-accent" />
              <h2 className="font-reading text-lg font-medium text-foreground">Featured for You</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredContent.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleContentClick(item)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl"
                >
                  <div className="aspect-[16/9] overflow-hidden">
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <span className="mb-2 inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-medium text-primary backdrop-blur-sm">
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                    </span>
                    <h3 className="mb-1 font-serif text-lg font-bold text-foreground">{item.title}</h3>
                    <p className="font-reading text-sm text-muted-foreground">{item.author}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-6">
              <h2 className="mb-4 font-reading text-lg font-medium text-foreground">Browse All Content</h2>
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
                  <Compass className="size-8 text-muted-foreground" />
                </div>
                <h3 className="mb-2 font-reading text-lg font-medium text-foreground">No content found</h3>
                <p className="font-reading text-sm text-muted-foreground">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredContent.map((item) => (
                  <ContentCard
                    key={item.id}
                    content={item}
                    onClick={() => handleContentClick(item)}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      <ContentPreviewModal
        content={selectedContent}
        open={modalOpen}
        onClose={handleCloseModal}
      />
    </>
  )
}
