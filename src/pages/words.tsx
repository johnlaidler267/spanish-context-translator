"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Bookmark, Brain, Loader2, Search, X } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import { useSavedWords } from "@/hooks/use-saved-words"
import { loadSourceAuthors } from "@/lib/source-authors"
import { loadReviewStates, makeCloze, type ReviewState } from "@/lib/practice"
import type { SavedWord } from "@/lib/saved-words"
import { LEARNING_LANGUAGE_LABEL, WORDS_EYEBROW } from "@/lib/storage/language-learning-preferences"
import { cn } from "@/lib/utils"
import {
  countByStatus,
  filterWords,
  groupBySource,
  practiceSummary,
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

/**
 * One line per word on wider screens: word | meaning | sentence | status (phones put the word,
 * meaning and status on one line with the sentence underneath). Clicking the row opens it: the
 * whole sentence, how practice has gone, and Edit translation / Remove.
 */
function WordRow({
  word,
  open,
  editing,
  onToggle,
  onEditingChange,
  onRemove,
  onSaveMeaning,
  showSource = true,
}: {
  word: ListedWord
  open: boolean
  /** Whether the translation is being edited (only one row at a time). */
  editing: boolean
  onToggle: () => void
  onEditingChange: (editing: boolean) => void
  onRemove: () => void
  onSaveMeaning: (meaning: string) => Promise<string | null>
  /** Off when the row already sits under its book's heading. */
  showSource?: boolean
}) {
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = () => {
    setDraft(word.meaning ?? "")
    setEditError(null)
    onEditingChange(true)
  }
  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const err = await onSaveMeaning(draft)
    setSaving(false)
    if (err) setEditError(err)
    else onEditingChange(false)
  }

  return (
    // The divider sits on an inner wrapper so the row's hover/open background can reach a little
    // past the text without widening the dotted lines between rows.
    <li
      className={cn(
        "-mx-3 rounded-lg px-3 transition-colors [&:not(:first-child)>div]:border-t",
        open ? "bg-card" : "[@media(hover:hover)]:hover:bg-card/70",
      )}
    >
      <div className="border-dotted border-border">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 rounded-lg py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,10rem)_minmax(0,9rem)_minmax(0,1fr)_auto] sm:gap-x-4"
        >
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:contents">
            <span className="min-w-0 break-words font-serif text-lg leading-snug text-foreground">{word.word}</span>
            <span className="min-w-0 break-words text-sm text-foreground/80">{word.meaning}</span>
          </span>
          <span
            className={cn(
              "w-max rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-4 sm:order-last",
              STATUS_CHIP[word.status],
            )}
          >
            {STATUS_LABEL[word.status]}
          </span>
          <span className="col-span-2 min-w-0 sm:col-span-1">
            {word.sentence && (
              <span
                className={cn(
                  "block text-sm italic leading-relaxed text-muted-foreground",
                  !open && "line-clamp-2 sm:line-clamp-1",
                )}
              >
                &ldquo;
                <SentenceWithWord sentence={word.sentence} word={word.word} />
                &rdquo;
              </span>
            )}
            {showSource && word.source_title && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{word.source_title}</span>
            )}
          </span>
        </button>
        {open && (
          <div className="flex flex-col gap-2 pb-3 text-[13px]">
            <p className="text-muted-foreground">{practiceSummary(word.review, new Date())}</p>
            {open && editing ? (
              <form onSubmit={(e) => void submitEdit(e)} className="flex flex-wrap items-center gap-2">
                <Input
                  id={`meaning-${word.id}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={`Translation of ${word.word}`}
                  autoFocus
                  className="h-8 max-w-xs flex-[1_1_12rem] text-sm"
                />
                <Button type="submit" size="sm" className="h-8" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => onEditingChange(false)}>
                  Cancel
                </Button>
                {editError && <p className="basis-full text-destructive">{editError}</p>}
              </form>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-1 font-medium">
                <button type="button" onClick={startEdit} className="text-primary hover:underline">
                  Edit translation
                </button>
                <button type="button" onClick={onRemove} className="text-editorial hover:underline">
                  Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** Words the reader saved from the word-details sheet, for their current learning language. */
export default function WordsPage() {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { openAuthModal } = useAuth()
  const { words, loaded, loading, error, canSave, remove, save, language } = useSavedWords()
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const saveMeaning = async (word: SavedWord, meaning: string) => {
    const { error: err } = await save({
      word: word.word,
      meaning,
      literal: word.literal,
      sentence: word.sentence,
      sourceTitle: word.source_title,
    })
    return err
  }

  const rowProps = (w: ListedWord) => ({
    open: openId === w.id,
    editing: editingId === w.id,
    onToggle: () => {
      setEditingId(null)
      setOpenId((id) => (id === w.id ? null : w.id))
    },
    onEditingChange: (on: boolean) => setEditingId(on ? w.id : null),
    onRemove: () => handleRemove(w),
    onSaveMeaning: (meaning: string) => saveMeaning(w, meaning),
  })

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

  // Authors for the group headings, looked up by book title (saved words only keep the title).
  const titlesKey = useMemo(
    () => [...new Set(words.map((w) => w.source_title?.trim()).filter((t): t is string => !!t))].sort().join("\n"),
    [words],
  )
  const [authors, setAuthors] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    let cancelled = false
    void loadSourceAuthors(titlesKey ? titlesKey.split("\n") : []).then((found) => {
      if (!cancelled) setAuthors(found)
    })
    return () => {
      cancelled = true
    }
  }, [titlesKey])

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
                    {g.source && authors.get(g.source) && (
                      <span className="ml-2 text-base font-normal italic text-muted-foreground">
                        {authors.get(g.source)}
                      </span>
                    )}
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
                <ul>
                  {g.words.map((w) => (
                    <WordRow key={w.id} word={w} {...rowProps(w)} showSource={false} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul>
            {shown.map((w) => (
              <WordRow key={w.id} word={w} {...rowProps(w)} />
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
              {languageLabel} words and phrases you&apos;ve saved while reading, grouped by where you found them.
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
