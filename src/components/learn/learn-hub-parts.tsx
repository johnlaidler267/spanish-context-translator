import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { BlankSentence } from "@/components/learn/conjugation-answer"
import { conjugate, personShort, TENSE_NAME, TENSES } from "@/lib/learn/conjugation"
import type { WarmUp } from "@/lib/learn/drill-round"
import { cn } from "@/lib/utils"

const WHEEL_VERB = "tener"
const WHEEL_STEPS = [
  { form: WHEEL_VERB, label: "the infinitive" },
  ...TENSES.filter((t) => t.id !== "perfect" && t.id !== "imperative").map((t) => ({ form: conjugate(WHEEL_VERB, t.id, 0), label: t.name.toLowerCase() })),
]
const WHEEL_INTERVAL_MS = 2200

/** One verb cycling through its forms: the landing's one moving element. Still for reduced motion. */
export function VerbWheel() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % WHEEL_STEPS.length), WHEEL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])
  const step = WHEEL_STEPS[index]
  return (
    <div aria-hidden className="mb-7">
      <div className="relative h-[4.4rem] sm:h-[5.4rem]">
        <span
          key={step.form}
          className="learn-wheel-word absolute bottom-0 left-0 whitespace-nowrap font-serif text-[3.8rem] font-medium leading-none tracking-tight text-primary sm:text-[4.8rem]"
        >
          {step.form}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-flex gap-1">
          {WHEEL_STEPS.map((s, i) => (
            <i
              key={s.form}
              className={cn("h-[5px] w-[5px] rounded-full transition-colors duration-300", i === index ? "bg-accent" : "bg-border")}
            />
          ))}
        </span>
        {step.label}
      </div>
    </div>
  )
}

/** A one-tap question right on the landing, so the page starts with practice instead of a menu. */
export function WarmUpCard({
  warmUp,
  onAnswer,
  onAnother,
  onKeepGoing,
}: {
  warmUp: WarmUp
  onAnswer: (right: boolean) => void
  onAnother: () => void
  onKeepGoing: () => void
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const { sentence, answer, options } = warmUp
  const right = chosen === answer
  return (
    <section className="rounded-2xl bg-card px-5 py-5 sm:px-6" aria-label="Warm-up question">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-label-2xs font-semibold uppercase tracking-[0.15em] text-accent">Warm up</span>
        <span className="text-xs text-muted-foreground">Pick the form</span>
      </div>
      <BlankSentence text={sentence.text} filled={chosen ? answer : undefined} right={right} className="text-xl sm:text-2xl" />
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{sentence.verb}</span> · {personShort(sentence.tense, sentence.person)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={chosen != null}
            onClick={() => {
              setChosen(o)
              onAnswer(o === answer)
            }}
            className={cn(
              "rounded-full border bg-background px-4 py-1.5 font-reading text-lg transition-colors",
              chosen == null && "border-border hover:border-primary",
              chosen != null && o === answer && "border-emerald-600 text-emerald-700 dark:border-emerald-300 dark:text-emerald-300",
              chosen != null && o === chosen && o !== answer && "border-red-600 text-red-700 dark:border-red-300 dark:text-red-300",
              chosen != null && o !== answer && o !== chosen && "border-border opacity-45",
            )}
          >
            {o}
          </button>
        ))}
      </div>
      {chosen && (
        <div className="mt-4" role="status">
          <p className="text-sm text-foreground">
            <span className={cn("font-semibold", right ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
              {right ? "Nice." : `It's ${answer}, the ${TENSE_NAME[sentence.tense].toLowerCase()}.`}
            </span>{" "}
            {sentence.why}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button className="rounded-full" onClick={onKeepGoing}>
              Keep going: 10 more
            </Button>
            <button type="button" onClick={onAnother} className="text-sm text-primary underline underline-offset-4">
              Another one
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** The landing's two doors. Each gets a small motif: fanned verb cards, or a book ribbon. */
export function LearnChoiceCard({
  to,
  variant,
  title,
  description,
  next,
  action,
}: {
  to: string
  variant: "conjugation" | "lessons"
  title: string
  description: string
  next: React.ReactNode
  action: string
}) {
  return (
    <Link to={to} className={cn("learn-choice group", variant === "conjugation" ? "learn-choice--conj" : "learn-choice--lesson")}>
      {variant === "conjugation" ? (
        <span className="learn-fan" aria-hidden>
          <i>-é</i>
          <i>-aste</i>
          <i>-ó</i>
        </span>
      ) : (
        <span className="learn-ribbon" aria-hidden />
      )}
      <span className="block pr-20 font-serif text-[1.55rem] font-medium leading-tight tracking-tight text-foreground">{title}</span>
      <span className="mb-4 mt-1 block pr-20 text-[0.95rem] text-muted-foreground">{description}</span>
      {/* mt-auto: cards share a row on desktop, so this footer lines up at the bottom of both. */}
      <span className="mt-auto flex items-center gap-3 border-t border-border pt-3.5 text-sm text-muted-foreground">
        <span className="min-w-0 flex-1">{next}</span>
        <span className="learn-choice__action shrink-0 font-medium">{action} →</span>
      </span>
    </Link>
  )
}
