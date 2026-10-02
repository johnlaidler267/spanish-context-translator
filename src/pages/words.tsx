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
  groupBySource,
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

/** The saved sentence, clamped to one line (two on phones); tapping a clamped one shows it in full. */
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
    <p ref={setEl} className={cn("text-sm italic leading-relaxed text-muted-foreground", !expanded && "line-clamp-2 sm:line-clamp-1")}>
      &ldquo;
      <SentenceWithWord sentence={sentence} word={word} />
      &rdquo;
    </p>
  )
  if (!clamped && !expanded) return <div>{text}</div>
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      aria-label={expanded ? "Show less of the sentence" : "Show the whole sentence"}
      className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {text}
    </button>
  )
}

function WordRow({
  word,
  onRemove,
  showSource = true,
}: {
  word: ListedWord
  onRemove: () => void
  /** Off when the row already sits under its book's heading. */
  showSource?: boolean
}) {
  // One line per word on wider screens: word | meaning | sentence | status. Phones put the
  // word, meaning and status on one line with the sentence underneath.
  return (
    <li className="group flex items-start gap-2 py-2.5">
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,9rem)_minmax(0,1fr)_auto] sm:gap-x-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:contents">
          <p className="min-w-0 break-words font-serif text-lg leading-snug text-foreground">{word.word}</p>
          <p className="min-w-0 break-words text-sm text-foreground/80">{word.meaning}</p>
        </div>
        <span
          className={cn(
            "w-max rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-4 sm:order-last",
            STATUS_CHIP[word.status],
          )}
        >
          {STATUS_LABEL[word.status]}
        </span>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          {word.sentence && <Sentence sentence={word.sentence} word={word.word} />}
          {showSource && word.source_title && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{word.source_title}</p>
          )}
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
  const [sort, setSort] = useState<WordSort>("source")
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
        <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-[1_1_14rem]">
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
            <div role="group" aria-label="Sort words" className="flex flex-wrap gap-1.5">
              {(Object.keys(SORT_LABEL) as WordSort[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => setSort(s)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    sort === s
                      ? "border-foreground/40 bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SORT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1" role="group" aria-label="Filter by practice status">
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
                    "rounded-full px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
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
        ) : sort === "source" ? (
          <div className="divide-y divide-border">
            {groupBySource(shown).map((g) => (
              <section key={g.source ?? ""} aria-label={g.source ?? "Other"} className="py-6 first:pt-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <h2 className="min-w-0 font-serif text-xl font-semibold leading-snug text-foreground">
                    {g.source ?? "Other"}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {g.words.length} {g.words.length === 1 ? "word" : "words"}
                    {g.source && (
                      <>
                        {" · "}
                        <Link
                          to={`/words/practice?source=${encodeURIComponent(g.source)}`}
                          className="font-medium text-primary hover:underline"
                        >
                          Practice these
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <ul className="divide-y divide-dotted divide-border">
                  {g.words.map((w) => (
                    <WordRow key={w.id} word={w} onRemove={() => handleRemove(w)} showSource={false} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-dotted divide-border">
            {shown.map((w) => (
              <WordRow key={w.id} word={w} onRemove={() => handleRemove(w)} />
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="discover-scroll-surface flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] font-sans">
      <main className="animate-fade-in-up mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:px-8 lg:pt-12">
        <header className="discover-masthead !mb-6">
          <div className="min-w-0 flex-1">
            <p className="discover-masthead__eyebrow">{WORDS_EYEBROW[language]}</p>
            <h1 className="discover-masthead__title">Words</h1>
            <p className="discover-masthead__lede">
              {languageLabel} words and phrases you&apos;ve saved while reading, with the sentence you found them in.
            </p>
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
