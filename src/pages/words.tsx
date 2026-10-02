"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Bookmark, Brain, Loader2, Search, X } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import { useSavedWords } from "@/hooks/use-saved-words"
import { loadReviewStates, makeCloze, type ReviewState } from "@/lib/practice"
import type { SavedWord } from "@/lib/saved-words"
import { LEARNING_LANGUAGE_LABEL, WORDS_EYEBROW } from "@/lib/storage/language-learning-preferences"
import { cn } from "@/lib/utils"
import {
  countByStatus,
  filterWords,
  SORT_LABEL,
  STATUS_LABEL,
  withStatus,
  type ListedWord,
  type StatusFilter,
  type WordSort,
  type WordStatus,
} from "@/lib/word-list"

/** How long a removed word can be brought back before it's actually deleted. */
const UNDO_MS = 5000

const STATUS_FILTERS: StatusFilter[] = ["all", "due", "new", "learning", "learned"]

const STATUS_CHIP: Record<WordStatus, string> = {
  due: "bg-primary/10 text-primary",
  new: "bg-secondary text-secondary-foreground",
  learning: "border border-border text-muted-foreground",
  learned: "text-muted-foreground",
}

/** The saved sentence with the saved word bolded (plain text if the word isn't found in it). */
function SentenceWithWord({ sentence, word }: { sentence: string; word: string }) {
  const parts = makeCloze(sentence, word)
  if (!parts) return <>{sentence}</>
  return (
    <>
      {parts.before}
      <strong className="font-semibold text-foreground">{parts.answer}</strong>
      {parts.after}
    </>
  )
}

/** The saved sentence, clamped to two lines; tapping a clamped one shows it in full. */
function Sentence({ sentence, word }: { sentence: string; word: string }) {
  // Held in state (not a ref): switching to the tappable version remounts the paragraph, and the
  // measurement has to follow the new element rather than keep watching the detached one.
  const [el, setEl] = useState<HTMLParagraphElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)

  useLayoutEffect(() => {
    if (!el || expanded) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, expanded, sentence])

  const text = (
    <p ref={setEl} className={cn("text-sm italic leading-relaxed text-muted-foreground", !expanded && "line-clamp-2")}>
      &ldquo;
      <SentenceWithWord sentence={sentence} word={word} />
      &rdquo;
    </p>
  )
  if (!clamped && !expanded) return <div className="mt-1">{text}</div>
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      aria-label={expanded ? "Show less of the sentence" : "Show the whole sentence"}
      className="mt-1 block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {text}
    </button>
  )
}

function WordRow({ word, onRemove }: { word: ListedWord; onRemove: () => void }) {
  return (
    <li className="group flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="font-serif text-lg leading-snug text-foreground">{word.word}</p>
          {word.meaning && (
            <p className="text-sm text-foreground/80">
              <span aria-hidden className="mr-2 text-muted-foreground/60">
                —
              </span>
              {word.meaning}
            </p>
          )}
        </div>
        {word.sentence && <Sentence sentence={word.sentence} word={word.word} />}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-4", STATUS_CHIP[word.status])}
          >
            {STATUS_LABEL[word.status]}
          </span>
          {word.source_title && <span className="truncate">{word.source_title}</span>}
        </div>
      </div>
      {/* On devices that can hover, keep the remove button out of the way until the row is hovered or focused. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${word.word}`}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-[opacity,color,background-color] hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )
}

/** Words the reader saved from the word-details sheet, for their current learning language. */
export default function WordsPage() {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { openAuthModal } = useAuth()
  const { words, loaded, loading, error, canSave, remove, language } = useSavedWords()
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Map<string, ReviewState>>(new Map())
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<WordSort>("newest")
  const [pending, setPending] = useState<SavedWord | null>(null)
  const pendingRef = useRef<{
    id: string
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  // Same page shell as Discover / My Library (see library/index.tsx for why these are layout effects).
  useLayoutEffect(() => {
    document.documentElement.classList.add("mobile-scroll-discover")
    return () => document.documentElement.classList.remove("mobile-scroll-discover")
  }, [])
  useLayoutEffect(() => {
    registerNewChat(() => navigate("/"))
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  // Practice progress lives on the same rows; without it every word just reads as "New".
  useEffect(() => {
    if (!canSave || !loaded) return
    let cancelled = false
    void loadReviewStates(language).then(({ states }) => {
      if (!cancelled) setReviews(states)
    })
    return () => {
      cancelled = true
    }
  }, [canSave, loaded, language])

  const languageLabel = LEARNING_LANGUAGE_LABEL[language]

  const deleteNow = useCallback(
    async (id: string) => {
      const { error: err } = await remove(id)
      if (err) setRemoveError(err)
    },
    [remove],
  )

  /** Delete whatever is waiting on its undo window right away. */
  const flushPending = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    clearTimeout(p.timer)
    pendingRef.current = null
    void deleteNow(p.id)
  }, [deleteNow])

  // Leaving the page still removes a word whose undo window hadn't run out.
  useEffect(() => flushPending, [flushPending])

  const handleRemove = (word: SavedWord) => {
    setRemoveError(null)
    flushPending()
    const timer = setTimeout(() => {
      pendingRef.current = null
      setPending(null)
      void deleteNow(word.id)
    }, UNDO_MS)
    pendingRef.current = { id: word.id, timer }
    setPending(word)
  }

  const handleUndo = () => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer)
    pendingRef.current = null
    setPending(null)
  }

  const listed = useMemo(() => {
    const visible = pending ? words.filter((w) => w.id !== pending.id) : words
    return withStatus(visible, reviews, new Date())
  }, [words, pending, reviews])
  const counts = useMemo(() => countByStatus(listed), [listed])
  const shown = useMemo(() => filterWords(listed, { query, status, sort }), [listed, query, status, sort])

  let body: React.ReactNode
  if (!canSave) {
    body = (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to save words while you read and find them here on any device.
        </p>
        <Button type="button" onClick={() => openAuthModal()}>
          Sign in
        </Button>
      </div>
    )
  } else if (loading && !loaded) {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your words…
      </div>
    )
  } else if (error) {
    body = <p className="text-sm text-muted-foreground">{error}</p>
  } else if (listed.length === 0) {
    body = (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No saved {languageLabel} words yet. While reading, tap a word to open its details, then tap{" "}
        <Bookmark className="inline h-4 w-4 -translate-y-px" aria-label="the bookmark" /> to save it.
      </div>
    )
  } else {
    body = (
      <>
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search words, meanings, books…"
                aria-label="Search saved words"
                className="pl-9"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as WordSort)}
              aria-label="Sort words"
              className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(SORT_LABEL) as WordSort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by practice status">
            {STATUS_FILTERS.map((s) => {
              const count = s === "all" ? listed.length : counts[s]
              const active = status === s
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s]} <span className="opacity-70">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No words match.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {shown.map((w) => (
              <WordRow key={w.id} word={w} onRemove={() => handleRemove(w)} />
            ))}
          </ul>
        )}
      </>
    )
  }

  const showStats = canSave && loaded && !error && listed.length > 0

  return (
    <div className="discover-scroll-surface flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] font-sans">
      <main className="animate-fade-in-up mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:px-8 lg:pt-12">
        <header className="discover-masthead">
          <div className="min-w-0 flex-1">
            <p className="discover-masthead__eyebrow">{WORDS_EYEBROW[language]}</p>
            <h1 className="discover-masthead__title">Words</h1>
            <p className="discover-masthead__lede">
              {languageLabel} words and phrases you&apos;ve saved while reading, with the sentence you found them in.
            </p>
            {showStats && (
              <p className="mt-3 text-sm text-muted-foreground" data-testid="words-stats">
                <span className="font-medium text-foreground">{listed.length}</span>{" "}
                {listed.length === 1 ? "word" : "words"}
                {" · "}
                <span className={cn(counts.due > 0 && "font-medium text-primary")}>{counts.due} due</span>
                {" · "}
                {counts.learned} learned
              </p>
            )}
          </div>
          {canSave && listed.length > 0 && (
            <Link
              to="/words/practice"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Brain className="h-4 w-4" aria-hidden /> Practice
            </Link>
          )}
        </header>
        {removeError && <p className="mb-3 text-sm text-destructive">{removeError}</p>}
        {body}
      </main>
      {pending && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-max max-w-[calc(100%-2rem)] items-center gap-4 rounded-full bg-foreground py-2 pl-5 pr-2 text-sm text-background shadow-lg animate-fade-in-up"
        >
          <span className="truncate">
            Removed <span className="font-serif">{pending.word}</span>
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full px-3 py-1 font-medium text-background underline-offset-2 hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
