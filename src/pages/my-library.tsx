import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { BookMarked, Compass, Heart, Upload } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing-shell-layout"
import { LibraryCard } from "@/components/library-card"
import { ContentPreviewModal } from "@/components/discover/content-preview-modal"
import { UploadModal } from "@/components/upload-modal"
import { Button } from "@/components/ui/button"
import {
  currentlyReadingItems,
  favoriteItems,
  type LibraryItem,
} from "@/lib/library-data"

type TabType = "reading" | "favorites"

export default function MyLibraryPage() {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const [activeTab, setActiveTab] = useState<TabType>("reading")
  const [selectedContent, setSelectedContent] = useState<LibraryItem | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [readingList, setReadingList] = useState(currentlyReadingItems)
  const [favorites, setFavorites] = useState(favoriteItems)

  useEffect(() => {
    registerNewChat(null)
    return () => registerNewChat(null)
  }, [registerNewChat])

  const handleContentClick = (content: LibraryItem) => {
    setSelectedContent(content)
    setPreviewOpen(true)
  }

  const handleRemoveFromReading = (id: string) => {
    setReadingList((prev) => prev.filter((item) => item.id !== id))
  }

  const handleRemoveFromFavorites = (id: string) => {
    setFavorites((prev) => prev.filter((item) => item.id !== id))
  }

  const currentItems = activeTab === "reading" ? readingList : favorites

  return (
    <main className="min-h-app bg-transparent px-4 pb-6 pt-4 md:px-8 md:pb-10 md:pt-8">
        <h1 className="font-display text-xl font-medium tracking-[-0.02em] text-foreground md:text-2xl">
          My Library
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your personal collection of saved content
        </p>

        <div className="mb-8 mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => setActiveTab("reading")}
            className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-all ${
              activeTab === "reading"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <BookMarked className="size-4" />
            Currently Reading
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                activeTab === "reading"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {readingList.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("favorites")}
            className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-all ${
              activeTab === "favorites"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <Heart className="size-4" />
            Favorites
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                activeTab === "favorites"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {favorites.length}
            </span>
          </button>
        </div>

        {currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
              {activeTab === "reading" ? (
                <BookMarked className="size-8 text-muted-foreground" />
              ) : (
                <Heart className="size-8 text-muted-foreground" />
              )}
            </div>
            <h3 className="mb-2 font-serif text-xl font-medium text-foreground">
              {activeTab === "reading" ? "No content in progress" : "No favorites yet"}
            </h3>
            <p className="mb-6 max-w-sm text-muted-foreground">
              {activeTab === "reading"
                ? "Start reading something from Discover or upload your own content."
                : "Heart your favorite content to save it here for quick access."}
            </p>
            <div className="flex gap-3">
              <Link to="/discover">
                <Button variant="outline" className="gap-2 rounded-full border-border bg-card">
                  <Compass className="size-4" />
                  Discover Content
                </Button>
              </Link>
              <Button onClick={() => setUploadOpen(true)} className="gap-2 rounded-full">
                <Upload className="size-4" />
                Upload
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {currentItems.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                showProgress={activeTab === "reading"}
                onClick={() => handleContentClick(item)}
                onRemove={() =>
                  activeTab === "reading"
                    ? handleRemoveFromReading(item.id)
                    : handleRemoveFromFavorites(item.id)
                }
              />
            ))}
          </div>
        )}

        {currentItems.length > 0 ? (
          <div className="mt-12 rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {activeTab === "reading" ? "Reading Stats" : "Favorites Overview"}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl bg-muted/50 p-4 text-center">
                <p className="font-serif text-3xl font-semibold text-foreground">{currentItems.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeTab === "reading" ? "In Progress" : "Saved Items"}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4 text-center">
                <p className="font-serif text-3xl font-semibold text-foreground">
                  {currentItems.reduce((sum, item) => sum + item.wordCount, 0).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Total Words</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4 text-center">
                <p className="font-serif text-3xl font-semibold text-foreground">
                  {new Set(currentItems.map((item) => item.language)).size}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Languages</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4 text-center">
                <p className="font-serif text-3xl font-semibold text-foreground">
                  {new Set(currentItems.map((item) => item.type)).size}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Content Types</p>
              </div>
            </div>
          </div>
        ) : null}

      {selectedContent ? (
        <ContentPreviewModal
          content={selectedContent}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onStartReading={(content) => {
            setPreviewOpen(false)
            navigate("/discover")
            console.log("[library] start reading from preview", content.id)
          }}
        />
      ) : null}
      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </main>
  )
}
