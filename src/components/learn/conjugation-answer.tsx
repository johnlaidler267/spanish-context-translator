import { forwardRef, useImperativeHandle, useRef } from "react"
import { Check, X } from "lucide-react"
import {
  isRight,
  personShort,
  TENSE_NAME,
  type Grade,
  type Person,
  type TenseId,
} from "@/lib/learn/conjugation"
import { cn } from "@/lib/utils"

const ACCENT_KEYS = ["á", "é", "í", "ó", "ú", "ñ"]

/** The answer box plus accent keys, for typed conjugation answers. */
export const ConjugationInput = forwardRef<
  { focus: () => void },
  { value: string; onChange: (v: string) => void; readOnly?: boolean }
>(function ConjugationInput({ value, onChange, readOnly }, ref) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }))

  // Puts the letter where the caret is (replacing any selection) and keeps the caret after it.
  const insertLetter = (letter: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? value.length
    const end = input?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + letter + value.slice(end))
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + letter.length, start + letter.length)
    })
  }

  return (
    <div className="mt-7 flex flex-col gap-3">
      <input
        id="learn-answer"
        ref={inputRef}
        aria-label="Your answer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Type the verb"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        lang="es"
        className="w-full rounded-none border-0 border-b-2 border-border bg-transparent px-0.5 py-2 font-reading text-2xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
      />
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert accented letter">
          {ACCENT_KEYS.map((letter) => (
            <button
              key={letter}
              type="button"
              tabIndex={-1}
              // Keep focus in the answer box so the phone keyboard stays open.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insertLetter(letter)}
              className="h-9 min-w-[2.25rem] rounded-md border border-border bg-card px-2 font-reading text-lg leading-none text-foreground transition-colors hover:bg-secondary"
            >
              {letter}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

/** What happened with an answer, naming the slip when it's a common one. */
export function GradeFeedback({
  grade,
  tense,
  person,
  revealed,
  children,
}: {
  grade: Grade
  tense: TenseId
  person: Person
  /** The reader asked for the answer instead of guessing. */
  revealed?: boolean
  children?: React.ReactNode
}) {
  const right = isRight(grade)
  let head: string
  switch (grade.kind) {
    case "correct":
      head = "Correct"
      break
    case "accent":
      head = "Right, just mind the accent"
      break
    case "wrong-tense":
      head = `That's the ${TENSE_NAME[grade.tense].toLowerCase()}`
      break
    case "wrong-person":
      head = `That's the ${personShort(tense, grade.person)} form`
      break
    default:
      head = revealed ? "Here's the answer" : "Not quite"
  }
  return (
    <div role="status" className="mt-6 flex flex-col gap-1.5 rounded-xl bg-card px-5 py-4">
      <p
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          grade.kind === "correct" && "text-emerald-700 dark:text-emerald-300",
          grade.kind === "accent" && "text-accent",
          !right && "text-red-700 dark:text-red-300",
        )}
      >
        {right ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <X className="h-4 w-4 shrink-0" aria-hidden />}
        {head}
      </p>
      {grade.kind !== "correct" && (
        <p className="text-sm text-foreground">
          {TENSE_NAME[tense]}, {personShort(tense, person)}: <span className="font-reading text-lg">{grade.answer}</span>
        </p>
      )}
      {children}
    </div>
  )
}

/** A sentence with its blank shown as a line, or filled in once answered. */
export function BlankSentence({
  text,
  filled,
  right,
  className,
}: {
  text: string
  filled?: string
  right?: boolean
  className?: string
}) {
  const [before, after] = text.split("___")
  return (
    <p className={cn("text-pretty font-reading text-2xl leading-snug text-foreground sm:text-[1.7rem]", className)}>
      {before}
      {filled ? (
        <span
          className={cn(
            "border-b-2",
            right ? "border-primary text-primary" : "border-red-600 text-red-700 dark:border-red-300 dark:text-red-300",
          )}
        >
          {filled}
        </span>
      ) : (
        <span className="inline-block w-[4.5em] translate-y-[-0.2em] border-b-2 border-muted-foreground/60 align-baseline" aria-label="blank" />
      )}
      {after}
    </p>
  )
}

/** The thin progress bar + close button over each question (drills and lessons). */
export function DrillTopBar({ value, label, onClose, closeLabel }: { value: number; label: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="mb-2 flex items-center gap-4">
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="min-w-[3.2rem] text-right text-xs tabular-nums text-muted-foreground">{label}</span>
    </div>
  )
}
