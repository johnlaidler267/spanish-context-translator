"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BookOpen, Plus, Upload } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { ensureSessionForGroq } from "@/lib/groq-edge"
import { Button } from "@/components/ui/button"
import { LibraryCard } from "@/components/library/library-card"
import { LibraryPreviewModal } from "@/components/library/library-preview-modal"
import {
  deleteUserEpub,
  saveEpubToLibrary,
  EpubLibraryError,
  type LibraryEpub,
} from "@/lib/storage/epub-library"
import {
  fetchLibraryCatalog,
  readCachedLibraryEpubs,
  writeCachedLibraryEpubs,
} from "@/lib/storage/library-catalog"
import { getReadingProgressPercent } from "@/lib/storage/reading-progress-storage"
import { ensureCloudReadingProgressPulled } from "@/lib/storage/reading-progress-sync"
import { cn } from "@/lib/utils"

type LibraryPageProps = {
  /** Opens a saved book straight into reading, resuming at its saved page if any (same
   *  pipeline Discover's "Start reading" uses -- see handleLibraryStartReading in App.tsx).
   *  Returns once the book's text has been fetched and handed to the reading pipeline (or has
   *  failed) -- this page awaits it to know when to clear the per-card "opening" spinner below. */
  onStartReading: (book: LibraryEpub) => Promise<void> | void
}

function LibrarySkeletonGrid() {
  return (
    <div className="discover-grid" aria-hidden>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="discover-card discover-card--skeleton">
          <div className="discover-card__frame">
            <span className="discover-loading-shimmer block h-full w-full" />
          </div>
          <div className="discover-card__body">
            <span className="discover-loading-shimmer mt-2 block h-4 w-4/5 rounded-full" />
            <span className="discover-loading-shimmer mt-1.5 block h-3 w-2/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LibraryPage({ onStartReading }: LibraryPageProps) {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { user } = useAuth()
  // Cache-first paint: if App.tsx's landing-page background prefetch (or a previous visit
  // this session) already warmed this user's library, render it immediately instead of a
  // skeleton -- see library-catalog.ts's docstring for why this replaced a plain
  // `listUserEpubs` call directly in the effect below.
  const cachedBooks = useMemo(() => (user ? readCachedLibraryEpubs(user.id) : null), [user])

  const [books, setBooks] = useState<LibraryEpub[]>(() => cachedBooks ?? [])
  const [listLoading, setListLoading] = useState(() => cachedBooks == null)
  const [listError, setListError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Which book (if any) is mid-open: getUserEpubText/handleLibraryStartReading (App.tsx) fetch
  // the saved book's full text -- and re-check auth -- over the network before the reading UI
  // ever appears, and until now that ran with zero visible feedback. On a slow connection that
  // read as the tap having done nothing at all (the reported "doesn't register on the first
  // tap" bug) -- a second tap felt like what finally worked, when really the first one was
  // just still loading. Also doubles as a guard against a second tap (this card or another)
  // kicking off a second concurrent open while one is already in flight.
  const [openingBookId, setOpeningBookId] = useState<string | null>(null)

  // A tap on a card now stops here first, per the user's request for a confirm step before
  // actually opening a book -- see LibraryPreviewModal.
  const [previewBook, setPreviewBook] = useState<LibraryEpub | null>(null)

  // Bumped once cloud-synced reading progress (reading-progress-sync.ts) has been merged into
  // the localStorage cache getReadingProgressPercent reads from -- same pattern as Discover's
  // forceRerenderForSyncedProgress -- so a book resumed on another device shows its real
  // progress here too, not just what this browser already knew about.
  const [, forceRerenderForSyncedProgress] = useState(0)

  useEffect(() => {
    beginRouteTransition(560)
    return () => cancelRouteTransition()
  }, [])

  // Same mobile document-scroll unlock Discover uses (this page shares its
  // `.discover-scroll-surface` shell/CSS -- see index.css's `mobile-scroll-discover` rules,
  // which key off this class name, not the route).
  //
  // useLayoutEffect, not useEffect: this class is what neutralizes .discover-scroll-surface's
  // own overflow-y-auto on mobile (see that CSS rule's docstring) -- without it, the surface
  // is briefly its own independent scroll container nested inside html, and a real finger's
  // tap on a card (which is never perfectly still) reads as scroll-vs-tap ambiguous, which the
  // browser can resolve by cancelling the click ("first tap doesn't register" -- see b1c67aa,
  // which fixed the CSS side of this same bug). A plain useEffect only adds this class *after*
  // the browser has already painted this page's first frame, so on a slow/cold load (this
  // route is itself lazy-loaded) there's a real window where the cards are visible and
  // tappable but the class isn't on <html> yet -- exactly a first-tap-after-refresh case.
  // useLayoutEffect runs in the same commit as the content becoming visible, closing that gap.
  useLayoutEffect(() => {
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
    void ensureCloudReadingProgressPulled(user).then(() => {
      if (!cancelled) forceRerenderForSyncedProgress((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Must match the initial `listLoading` state's condition (cachedBooks == null), not
      // "cache is falsy or empty" -- a legitimately empty cached library (0 books) is still a
      // cache hit and shouldn't flip the skeleton back on for this background refetch.
      if (cachedBooks == null) setListLoading(true)
      setListError(null)
      // Same fetchLibraryCatalog() the landing-page background prefetch calls (see App.tsx) --
      // if that prefetch is still in flight when this page mounts, this joins that same
      // request/promise instead of firing a second one; if it already finished, this paints
      // instantly from the cache it already wrote and just revalidates in the background.
      const items = await fetchLibraryCatalog(user)
      if (cancelled) return
      setBooks(items)
      setListLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, cachedBooks])

  const handleUploadClick = () => {
    if (uploading) return
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so selecting the same file again still fires a change event.
    e.target.value = ""
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      // Lazy: pulls in jszip, only needed once someone actually uploads a book -- see the same
      // reasoning on the landing page's own upload (landing-screen.tsx).
      const { parseEpub } = await import("@/lib/epub/parse-epub")
      const { text, title, author, description, coverImage } = await parseEpub(file)

      // Guests browsing straight to /library may not have a Supabase session yet at all (one
      // is normally created as a side effect of a first translate -- see ensureSessionForGroq's
      // docstring) -- establish one here too so a first-ever upload still has an account to
      // save against, instead of silently doing nothing.
      await ensureSessionForGroq()
      const {
        data: { user: freshUser },
      } = await supabase.auth.getUser()

      const saved = await saveEpubToLibrary(freshUser, {
        title,
        fileName: file.name,
        text,
        coverImage,
        author,
        description,
      })
      if (!saved) {
        setUploadError("Could not save this book to your library. Check your connection and try again.")
        return
      }

      const newBook: LibraryEpub = {
        id: saved.id,
        title: title?.trim() || file.name.replace(/\.epub$/i, "").trim() || "Untitled",
        fileName: file.name,
        charCount: text.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        coverImage,
        author: author?.trim() || null,
        description: description?.trim() || null,
      }
      setBooks((prev) => {
        const next = [newBook, ...prev]
        if (freshUser) writeCachedLibraryEpubs(freshUser.id, next)
        return next
      })
      onStartReading(newBook)
    } catch (err) {
      setUploadError(
        err instanceof EpubLibraryError
          ? err.message
          : err instanceof Error && err.name === "EpubParseError"
            ? err.message
            : err instanceof Error
              ? err.message
              : "Couldn't read this EPUB file. Make sure it's a valid .epub and try again.",
      )
    } finally {
      setUploading(false)
    }
  }

  const handleOpenBook = async (book: LibraryEpub) => {
    if (openingBookId) return
    setOpeningBookId(book.id)
    try {
      await onStartReading(book)
    } finally {
      // A successful open navigates away (this page unmounts), so this only visibly matters
      // on failure -- clears the spinner so the card is tappable again instead of stuck, and
      // closes the preview modal so App.tsx's own error modal (e.g. "Couldn't load this book")
      // isn't left stacked behind it.
      setOpeningBookId(null)
      setPreviewBook(null)
    }
  }

  const handleDelete = async (id: string) => {
    const previous = books
    const next = previous.filter((b) => b.id !== id)
    setBooks(next)
    if (user) writeCachedLibraryEpubs(user.id, next)
    const ok = await deleteUserEpub(user, id)
    if (!ok) {
      setBooks(previous)
      if (user) writeCachedLibraryEpubs(user.id, previous)
      setListError("Could not remove that book. Check your connection and try again.")
    }
  }

  return (
    <div className="discover-scroll-surface flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] font-sans">
      <main className="animate-fade-in-up mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:px-8 lg:pt-12">
        <header className="discover-masthead">
          <div className="min-w-0 flex-1">
            <p className="discover-masthead__eyebrow">Tu biblioteca</p>
            <h1 className="discover-masthead__title">My Library</h1>
            <p className="discover-masthead__lede">
              Books you've uploaded, saved so you can pick up right where you left off.
            </p>
          </div>
          <Button
            variant="outline"
            className="discover-trigger shrink-0"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? (
              <Upload className="size-4 animate-pulse" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {uploading ? "Reading your book…" : "Upload EPUB"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,application/epub+zip"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void handleFileSelected(e)}
          />
        </header>

        {listError && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {listError}
          </p>
        )}
        {uploadError && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {uploadError}
          </p>
        )}

        {listLoading ? (
          <LibrarySkeletonGrid />
        ) : books.length === 0 ? (
          <div className="discover-empty">
            <span className="corner corner-tl" aria-hidden />
            <span className="corner corner-tr" aria-hidden />
            <span className="corner corner-bl" aria-hidden />
            <span className="corner corner-br" aria-hidden />
            <BookOpen className="discover-empty__icon" aria-hidden />
            <h3 className="discover-empty__title">No books yet</h3>
            <p className="discover-empty__text">
              Upload an EPUB and it'll show up here, with your reading progress, every time you come back.
            </p>
            <Button
              variant="outline"
              className={cn("discover-trigger mt-4", uploading && "pointer-events-none opacity-60")}
              onClick={handleUploadClick}
            >
              <Plus className="size-4" aria-hidden />
              Upload your first book
            </Button>
          </div>
        ) : (
          <div className="discover-grid">
            {books.map((book) => (
              <LibraryCard
                key={book.id}
                book={book}
                progressPercent={getReadingProgressPercent(user, book.id)}
                onOpen={() => setPreviewBook(book)}
                onDelete={() => void handleDelete(book.id)}
                isOpening={openingBookId === book.id}
                disabled={openingBookId != null && openingBookId !== book.id}
              />
            ))}
          </div>
        )}
      </main>

      <LibraryPreviewModal
        book={previewBook}
        open={previewBook != null}
        onClose={() => setPreviewBook(null)}
        onStartReading={(book) => void handleOpenBook(book)}
        progressPercent={previewBook ? getReadingProgressPercent(user, previewBook.id) : null}
        isOpening={previewBook != null && openingBookId === previewBook.id}
      />
    </div>
  )
}
