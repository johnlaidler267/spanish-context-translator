import { useEffect, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { BlankSentence, ConjugationInput, DrillTopBar, GradeFeedback } from "@/components/learn/conjugation-answer"
import { LearnPageShell } from "@/components/learn/learn-page-shell"
import { gradeConjugation, isRight, personShort, TENSE_NAME, type Grade } from "@/lib/learn/conjugation"
import { findLesson, parseInline, type LessonStep, type TeachBlock } from "@/lib/learn/lessons"
import { markLessonCompleted } from "@/lib/learn/progress-storage"
import { cn } from "@/lib/utils"

/** Plays one mini lesson: teaching screens, then choices and typed practice, then a recap. */
export default function LearnLessonPage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const lesson = findLesson(lessonId)
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState({ right: 0, asked: 0 })

  if (!lesson) return <Navigate to="/learn/lessons" replace />

  const total = lesson.steps.length
  const done = index >= total
  const record = (right: boolean) => setScore((s) => ({ right: s.right + (right ? 1 : 0), asked: s.asked + 1 }))
  const next = () => {
    if (index + 1 === total) markLessonCompleted(lesson.id)
    setIndex((i) => i + 1)
    document.querySelector(".discover-scroll-surface")?.scrollTo(0, 0)
  }

  return (
    <LearnPageShell>
      <DrillTopBar value={Math.min(index, total) / total} label={lesson.title} onClose={() => navigate("/learn/lessons")} closeLabel="Leave lesson" />
      <div className="pt-8 sm:pt-10">
        {done ? (
          <div className="animate-fade-in-up">
            <Eyebrow>Lesson complete</Eyebrow>
            <h1 className="mt-1.5 text-balance font-serif text-[2rem] font-medium leading-tight tracking-tight text-foreground">
              {lesson.finish.title}
            </h1>
            <p className="mt-3 text-foreground">
              {score.right} of {score.asked} right on the first try.
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {lesson.finish.recap.map((line) => (
                <li key={line} className="relative pl-[18px] text-[0.95rem] text-foreground before:absolute before:left-0 before:top-[0.62em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent">
                  <Inline text={line} />
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {lesson.finish.drill && (
                <Button className="rounded-full px-7" onClick={() => navigate(`/learn/conjugation?tense=${lesson.finish.drill!.tenses.join(",")}`)}>
                  {lesson.finish.drill.label}
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate("/learn/lessons")}>
                Back to lessons
              </Button>
            </div>
          </div>
        ) : (
          <Step key={index} step={lesson.steps[index]} onAnswered={record} onNext={next} />
        )}
      </div>
    </LearnPageShell>
  )
}

function Step({ step, onAnswered, onNext }: { step: LessonStep; onAnswered: (right: boolean) => void; onNext: () => void }) {
  const [answered, setAnswered] = useState(step.kind === "teach")

  // Enter moves on once the step is answered (teach steps count as answered).
  useEffect(() => {
    if (!answered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest("button, a, textarea, select")) return
      e.preventDefault()
      onNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [answered, onNext])

  const markAnswered = (right: boolean) => {
    setAnswered(true)
    onAnswered(right)
  }

  return (
    <div className="animate-fade-in-up">
      {step.kind === "teach" && <TeachStep step={step} />}
      {step.kind === "choice" && <ChoiceStep step={step} onAnswered={markAnswered} />}
      {step.kind === "type" && <TypeStep step={step} onAnswered={markAnswered} />}
      {answered && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <Button className="rounded-full px-7" onClick={onNext}>
            Continue
          </Button>
          <span className="text-xs text-muted-foreground max-sm:hidden">Enter ↵</span>
        </div>
      )}
    </div>
  )
}

function TeachStep({ step }: { step: Extract<LessonStep, { kind: "teach" }> }) {
  return (
    <div className="flex flex-col gap-4">
      <Eyebrow>Mini lesson</Eyebrow>
      <h1 className="-mt-2.5 text-balance font-serif text-[2rem] font-medium leading-tight tracking-tight text-foreground sm:text-[2.3rem]">
        {step.title}
      </h1>
      {step.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: TeachBlock }) {
  switch (block.type) {
    case "text":
      return (
        <p className="max-w-lg text-base text-foreground">
          <Inline text={block.text} />
        </p>
      )
    case "pattern":
      return (
        <div className="flex flex-wrap items-center gap-2 text-[0.95rem]">
          {block.parts.map((part, i) => (
            <span key={i} className="contents">
              {i > 0 && <span className="text-muted-foreground">{i === 1 ? "+" : ","}</span>}
              <span
                className={cn(
                  "rounded-full border px-3.5 py-1.5",
                  part.key ? "border-primary text-primary" : "border-border bg-card text-foreground",
                )}
              >
                {part.text}
              </span>
            </span>
          ))}
        </div>
      )
    case "example":
      return (
        <div className="border-l-2 border-border pl-4">
          {block.label && <p className="text-label-2xs font-semibold uppercase tracking-[0.14em] text-accent">{block.label}</p>}
          <p className="font-reading text-[1.3rem] leading-snug text-foreground">
            <Inline text={block.es} />
          </p>
          <p className="text-sm text-muted-foreground">{block.en}</p>
        </div>
      )
    case "note":
      return (
        <p className="text-sm text-muted-foreground">
          <Inline text={block.text} />
        </p>
      )
  }
}

function ChoiceStep({ step, onAnswered }: { step: Extract<LessonStep, { kind: "choice" }>; onAnswered: (right: boolean) => void }) {
  const [chosen, setChosen] = useState<number | null>(null)
  const picked = chosen != null ? step.options[chosen] : null
  const correct = step.options.find((o) => o.right)!
  return (
    <div>
      <Eyebrow>Pick the form</Eyebrow>
      <BlankSentence text={step.text} filled={picked?.text} right={picked?.right} className="mt-2.5" />
      <div className="mt-5 flex flex-col gap-2">
        {step.options.map((o, i) => (
          <button
            key={o.text}
            type="button"
            disabled={chosen != null}
            onClick={() => {
              setChosen(i)
              onAnswered(o.right === true)
            }}
            className={cn(
              "rounded-xl border px-4 py-3 text-left font-reading text-xl transition-colors",
              chosen == null && "border-border hover:border-primary",
              chosen != null && o.right && "border-emerald-600 text-emerald-700 dark:border-emerald-300 dark:text-emerald-300",
              chosen === i && !o.right && "border-red-600 text-red-700 dark:border-red-300 dark:text-red-300",
              chosen != null && chosen !== i && !o.right && "border-border opacity-45",
            )}
          >
            {o.text}
          </button>
        ))}
      </div>
      {picked && (
        <div role="status" className="mt-6 flex flex-col gap-1.5 rounded-xl bg-card px-5 py-4">
          <p className={cn("text-sm font-semibold", picked.right ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
            {picked.right ? "Correct" : `It's ${correct.text}`}
          </p>
          <p className="text-sm text-foreground">{picked.why}</p>
        </div>
      )}
    </div>
  )
}

function TypeStep({ step, onAnswered }: { step: Extract<LessonStep, { kind: "type" }>; onAnswered: (right: boolean) => void }) {
  const [typed, setTyped] = useState("")
  const [grade, setGrade] = useState<Grade | null>(null)
  const inputRef = useRef<{ focus: () => void }>(null)
  useEffect(() => inputRef.current?.focus(), [])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (grade || !typed.trim()) return
        const g = gradeConjugation(step.verb, step.tense, step.person, typed)
        setGrade(g)
        onAnswered(isRight(g))
      }}
    >
      <Eyebrow>{step.prompt}</Eyebrow>
      <BlankSentence text={step.text} filled={grade?.answer} right={grade ? isRight(grade) : undefined} className="mt-2.5" />
      <p className="mt-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{step.verb}</span> · {TENSE_NAME[step.tense].toLowerCase()} ·{" "}
        {personShort(step.tense, step.person)}
      </p>
      <ConjugationInput ref={inputRef} value={typed} onChange={setTyped} readOnly={grade != null} />
      {grade ? (
        <GradeFeedback grade={grade} tense={step.tense} person={step.person} />
      ) : (
        <div className="mt-6">
          <Button type="submit" className="rounded-full px-7" disabled={!typed.trim()}>
            Check
          </Button>
        </div>
      )}
    </form>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-label-2xs font-semibold uppercase tracking-[0.15em] text-accent">{children}</p>
}

/** Renders `**highlight**` and `_spanish_` markup from lesson text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((seg, i) =>
        seg.style === "highlight" ? (
          <b key={i} className="font-medium text-primary">
            {seg.text}
          </b>
        ) : seg.style === "spanish" ? (
          <i key={i} className="font-reading text-[1.06em] text-foreground">
            {seg.text}
          </i>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}
