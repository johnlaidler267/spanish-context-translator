"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Check, Loader2, Lightbulb, X } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useSavedWords } from "@/hooks/use-saved-words"
import {
  answerText,
  checkAnswer,
  isDue,
  loadReviewStates,
  makeCloze,
  NEW_REVIEW_STATE,
  pickRound,
  saveReviewState,
  scheduleReview,
  type AnswerMatch,
  type Outcome,
  type PracticeWord,
  type ReviewState,
} from "@/lib/practice"
import { LEARNING_LANGUAGE_LABEL, WORDS_EYEBROW, type LearningLanguage } from "@/lib/storage/language-learning-preferences"
import { cn } from "@/lib/utils"

const INPUT_LANG: Record<LearningLanguage, string> = { spanish: "es", french: "fr", english: "en" }

type Card = { word: PracticeWord; retry: boolean }
type Result = { word: PracticeWord; outcome: Outcome }
type Feedback = { match: AnswerMatch; outcome: Outcome; answer: string }

/** Fill-in-the-blank practice over the reader's saved words, in rounds of ten. */
export default function WordsPracticePage() {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { openAuthModal } = useAuth()
  const { words, loaded, loading, error, canSave, language } = useSavedWords()
  const languageLabel = LEARNING_LANGUAGE_LABEL[language]

  useLayoutEffect(() => {
    document.documentElement.classList.add("mobile-scroll-discover")
    return () => document.documentElement.classList.remove("mobile-scroll-discover")
  }, [])
  useLayoutEffect(() => {
    registerNewChat(() => navigate("/"))
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  // Review state per word id; null until loaded for this language.
  const [reviews, setReviews] = useState<{ language: string; states: Map<string, ReviewState>; saves: boolean } | null>(
    null,
  )
  useEffect(() => {
    if (!loaded) return
    let cancelled = false
    void loadReviewStates(language).then((r) => {
      if (!cancelled) setReviews({ language, ...r })
    })
    return () => {
      cancelled = true
    }
  }, [loaded, language])

  const practiceWords = useMemo<PracticeWord[]>(() => {
    if (!reviews || reviews.language !== language) return []
    return (
      words
        .map((w) => ({ ...w, review: reviews.states.get(w.id) ?? NEW_REVIEW_STATE }))
        // Needs something to cue the answer: the sentence to blank it in, or its meaning.
        .filter((w) => makeCloze(w.sentence, w.word) || w.meaning)
    )
  }, [words, reviews, language])

  const [queue, setQueue] = useState<Card[] | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [roundSize, setRoundSize] = useState(0)

  const startRound = () => {
    const round = pickRound(practiceWords, new Date())
    setQueue(round.map((word) => ({ word, retry: false })))
    setResults([])
    setRoundSize(round.length)
  }

  // Start the first round as soon as the words and their review state are in.
  const ready = reviews != null && reviews.language === language
  const startedRef = useRef(false)
  useEffect(() => {
    if (!ready || startedRef.current || practiceWords.length === 0) return
    startedRef.current = true
    startRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the first round starts on its own
  }, [ready, practiceWords.length])

  const record = (card: Card, outcome: Outcome) => {
    if (card.retry) return
    const next = scheduleReview(card.word.review, outcome, new Date())
    setResults((r) => [...r, { word: card.word, outcome }])
    setReviews((prev) => {
      if (!prev) return prev
      const states = new Map(prev.states)
      states.set(card.word.id, next)
      return { ...prev, states }
    })
    if (reviews?.saves) void saveReviewState(card.word.id, next)
  }

  const advance = (card: Card, missed: boolean) => {
    setQueue((q) => {
      if (!q) return q
      const rest = q.slice(1)
      // A missed word comes back once at the end of the round -- recalling it again a few
      // minutes later is what starts to fix it in memory.
      return missed && !card.retry ? [...rest, { word: card.word, retry: true }] : rest
    })
  }

  let body: React.ReactNode
  if (!canSave) {
    body = (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">Sign in to save words while you read and practice them here.</p>
        <Button type="button" onClick={() => openAuthModal()}>
          Sign in
        </Button>
      </div>
    )
  } else if (error) {
    body = <p className="text-sm text-muted-foreground">{error}</p>
  } else if ((loading && !loaded) || !ready) {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your words…
      </div>
    )
  } else if (practiceWords.length === 0) {
    body = (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No saved {languageLabel} words to practice yet. Save words while you read and they&apos;ll show up here.
      </div>
    )
  } else if (queue && queue.length > 0) {
    const card = queue[0]
    // Counted from the queue (which still holds this card until Continue), not from results,
    // so the counter doesn't jump ahead while the answer's feedback is showing.
    const position = roundSize - queue.filter((c) => !c.retry).length + 1
    body = (
      <PracticeCard
        key={`${card.word.id}-${card.retry}`}
        card={card}
        languageLabel={languageLabel}
        lang={INPUT_LANG[language]}
        progress={card.retry ? "Once more" : `${position} of ${roundSize}`}
        progressValue={card.retry ? 1 : (position - 1) / Math.max(roundSize, 1)}
        onAnswered={(outcome) => record(card, outcome)}
        onContinue={(outcome) => advance(card, outcome === "missed")}
      />
    )
  } else if (queue) {
    const now = new Date()
    const dueLeft = practiceWords.filter((w) => isDue(w, now)).length
    body = (
      <RoundSummary
        results={results}
        dueLeft={dueLeft}
        saves={reviews?.saves ?? false}
        onNewRound={startRound}
        onDone={() => navigate("/words")}
      />
    )
  }

  return (
    <div className="discover-scroll-surface flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] font-sans">
      <main className="animate-fade-in-up mx-auto w-full max-w-2xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6 md:pt-10 lg:px-8 lg:pt-12">
        <Link
          to="/words"
          className="mb-3 inline-flex items-center gap-1.5 sm:mb-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Words
        </Link>
        {/* Hidden on phones mid-round so the sentence and answer box fit above the keyboard. */}
        <header className={cn("discover-masthead !mb-8", queue && queue.length > 0 && "max-sm:hidden")}>
          <div className="min-w-0 flex-1">
            <p className="discover-masthead__eyebrow">{WORDS_EYEBROW[language]}</p>
            <h1 className="discover-masthead__title">Practice</h1>
          </div>
        </header>
        {body}
      </main>
    </div>
  )
}

function PracticeCard({
  card,
  languageLabel,
  lang,
  progress,
  progressValue,
  onAnswered,
  onContinue,
}: {
  card: Card
  languageLabel: string
  lang: string
  progress: string
  progressValue: number
  onAnswered: (outcome: Outcome) => void
  onContinue: (outcome: Outcome) => void
}) {
  const { word } = card
  const cloze = useMemo(() => makeCloze(word.sentence, word.word), [word.sentence, word.word])
  const answer = cloze?.answer ?? answerText(word.word)
  const [typed, setTyped] = useState("")
  const [hinted, setHinted] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (feedback) continueRef.current?.focus()
    else inputRef.current?.focus()
  }, [feedback])

  const finish = (match: AnswerMatch) => {
    const outcome: Outcome = match === "wrong" ? "missed" : hinted ? "hinted" : "correct"
    setFeedback({ match, outcome, answer })
    onAnswered(outcome)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (feedback) return
    if (!typed.trim()) return
    finish(checkAnswer(typed, [answer, answerText(word.word)]))
  }

  const right = feedback != null && feedback.match !== "wrong"
  const blankWidth = `${Math.max(answer.length, 4) + 1}ch`

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs sm:mb-3 text-muted-foreground">
        <span>{progress}</span>
        {card.retry && <span>You missed this one earlier</span>}
      </div>
      <div className="mb-4 h-1 w-full sm:mb-6 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progressValue * 100}%` }} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-7">
        {cloze ? (
          <p className="font-serif text-lg leading-relaxed text-foreground sm:text-2xl" data-testid="practice-sentence">
            {cloze.before}
            {feedback ? (
              <span
                className={cn(
                  "rounded px-1 font-semibold",
                  right ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300",
                )}
              >
                {cloze.answer}
              </span>
            ) : (
              <span
                aria-label="blank"
                className="inline-block border-b-2 border-foreground/40 align-baseline"
                style={{ width: blankWidth }}
              >
                {hinted && <span className="text-muted-foreground">{answer[0]}</span>}
                &nbsp;
              </span>
            )}
            {cloze.after}
          </p>
        ) : (
          <p className="font-serif text-lg text-foreground sm:text-2xl">
            {feedback ? answer : `The ${languageLabel} for…`}
          </p>
        )}

        {word.meaning && (
          <p className="mt-4 text-sm text-foreground/90">
            <span className="text-muted-foreground">{cloze ? "The missing word means " : ""}</span>
            <span data-testid="practice-meaning">&ldquo;{word.meaning}&rdquo;</span>
          </p>
        )}
        {word.source_title && (
          <p className="mt-2 text-xs text-muted-foreground">
            From <span className="italic">{word.source_title}</span>
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-5">
        <label htmlFor="practice-answer" className="sr-only">
          Your answer
        </label>
        <input
          id="practice-answer"
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={feedback != null}
          placeholder={hinted ? `Starts with “${answer[0]}”` : `Type the missing ${languageLabel} word`}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          lang={lang}
          className="h-12 w-full rounded-lg border border-border bg-background px-4 text-lg text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-80"
        />

        {feedback ? (
          <div className="mt-4">
            <p
              role="status"
              className={cn(
                "flex items-start gap-2 text-sm",
                right ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300",
              )}
            >
              {right ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <X className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                {feedback.match === "exact" && "Correct!"}
                {feedback.match === "accent" && <>Right — watch the accents: <strong>{feedback.answer}</strong></>}
                {feedback.match === "typo" && <>Almost — it&apos;s spelled <strong>{feedback.answer}</strong></>}
                {feedback.match === "wrong" && <>The answer was <strong>{feedback.answer}</strong>. It&apos;ll come back at the end of the round.</>}
              </span>
            </p>
            <Button ref={continueRef} type="button" className="mt-4 w-full sm:w-auto" onClick={() => onContinue(feedback.outcome)}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!typed.trim()}>
              Check
            </Button>
            {!hinted && answer.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setHinted(true)
                  inputRef.current?.focus()
                }}
              >
                <Lightbulb className="mr-1.5 h-4 w-4" aria-hidden /> Hint
              </Button>
            )}
            <Button type="button" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => finish("wrong")}>
              Show answer
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}

function RoundSummary({
  results,
  dueLeft,
  saves,
  onNewRound,
  onDone,
}: {
  results: Result[]
  dueLeft: number
  saves: boolean
  onNewRound: () => void
  onDone: () => void
}) {
  const firstTry = results.filter((r) => r.outcome === "correct").length
  return (
    <div>
      <div className="rounded-xl border border-border bg-card p-5 sm:p-7">
        <p className="font-serif text-2xl text-foreground">Round complete</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {firstTry} of {results.length} right on the first try.{" "}
          {dueLeft > 0
            ? `${dueLeft} more ${dueLeft === 1 ? "word is" : "words are"} ready to review.`
            : "You're caught up — anything more now is extra practice."}
        </p>
        <ul className="mt-5 divide-y divide-border">
          {results.map(({ word, outcome }) => (
            <li key={word.id} className="flex items-center gap-3 py-2">
              {outcome === "missed" ? (
                <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-300" aria-label="Missed" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-label="Right" />
              )}
              <span className="font-serif text-lg text-foreground">{answerText(word.word)}</span>
              {word.meaning && <span className="min-w-0 truncate text-sm text-muted-foreground">{word.meaning}</span>}
            </li>
          ))}
        </ul>
        {!saves && (
          <p className="mt-4 text-xs text-muted-foreground">Your practice progress couldn&apos;t be saved this time.</p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={onNewRound}>
          Start a new round
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
