"use client"

import { useLayoutEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Bookmark, Brain, Loader2, X } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useSavedWords } from "@/hooks/use-saved-words"
import { LEARNING_LANGUAGE_LABEL, WORDS_EYEBROW } from "@/lib/storage/language-learning-preferences"

/** Words the reader saved from the word-details sheet, for their current learning language. */
export default function WordsPage() {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { openAuthModal } = useAuth()
  const { words, loaded, loading, error, canSave, remove, language } = useSavedWords()
  const [removeError, setRemoveError] = useState<string | null>(null)

  // Same page shell as Discover / My Library (see library/index.tsx for why these are layout effects).
  useLayoutEffect(() => {
    document.documentElement.classList.add("mobile-scroll-discover")
    return () => document.documentElement.classList.remove("mobile-scroll-discover")
  }, [])
  useLayoutEffect(() => {
    registerNewChat(() => navigate("/"))
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  const languageLabel = LEARNING_LANGUAGE_LABEL[language]

  const handleRemove = async (id: string) => {
    setRemoveError(null)
    const { error: err } = await remove(id)
    if (err) setRemoveError(err)
  }

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
  } else if (words.length === 0) {
    body = (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No saved {languageLabel} words yet. While reading, tap a word to open its details, then tap{" "}
        <Bookmark className="inline h-4 w-4 -translate-y-px" aria-label="the bookmark" /> to save it.
      </div>
    )
  } else {
    body = (
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {words.map((w) => (
          <li key={w.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg leading-snug text-foreground">{w.word}</p>
              {w.meaning && <p className="text-sm text-foreground/90">{w.meaning}</p>}
              {w.sentence && (
                <p className="mt-1 text-sm italic text-muted-foreground">&ldquo;{w.sentence}&rdquo;</p>
              )}
              {w.source_title && <p className="mt-1 text-xs text-muted-foreground">{w.source_title}</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleRemove(w.id)}
              aria-label={`Remove ${w.word}`}
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    )
  }

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
          </div>
          {canSave && words.length > 0 && (
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
    </div>
  )
}
