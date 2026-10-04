import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Check } from "lucide-react"
import { Confetti } from "@/components/words/confetti"
import { Button } from "@/components/ui/button"
import { BlankSentence, ConjugationInput, DrillTopBar, GradeFeedback } from "@/components/learn/conjugation-answer"
import { LearnHeading, LearnPageShell } from "@/components/learn/learn-page-shell"
import {
  gradeConjugation,
  isRight,
  listTenses,
  PERSON_LABEL,
  PERSON_SHORT,
  TENSE_IDS,
  TENSE_NAME,
  TENSES,
  type Grade,
  type TenseId,
} from "@/lib/learn/conjugation"
import { DRILL_VERB_MEANING } from "@/lib/learn/drill-content"
import {
  buildMissesRound,
  buildRound,
  weakestTense,
  type DrillItem,
  type DrillSettings,
  type QuestionMode,
  type VerbSet,
} from "@/lib/learn/drill-round"
import { loadDrillSettings, loadTenseStats, recordTenseAnswer, saveDrillSettings } from "@/lib/learn/progress-storage"
import { cn } from "@/lib/utils"

type Answered = { item: DrillItem; grade: Grade; typed: string }
type Phase = { name: "setup" } | { name: "drill"; round: DrillItem[]; index: number; answered: Answered[] } | { name: "results"; round: DrillItem[]; answered: Answered[] }

const isTenseId = (v: string | null): v is TenseId => v != null && (TENSE_IDS as readonly string[]).includes(v)

/** Conjugation drills: pick tenses, answer rounds of ten, see what you missed. */
export default function LearnConjugationPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [settings, setSettings] = useState(loadDrillSettings)
  const [stats, setStats] = useState(loadTenseStats)
  const [editing, setEditing] = useState(false)
  // `?start=1` (from the warm-up) opens straight into a round. `?tense=a,b` (from a lesson) starts
  // a one-off round of those tenses without changing the reader's saved tense picks.
  const [phase, setPhase] = useState<Phase>(() => {
    const tenses = (params.get("tense") ?? "").split(",").filter(isTenseId)
    if (params.get("start") == null && tenses.length === 0) return { name: "setup" }
    const round = buildRound(tenses.length > 0 ? { ...settings, tenses } : settings, stats)
    return { name: "drill", round, index: 0, answered: [] }
  })
  // Drop the link params so a reload or "back" lands on the setup screen, not another round.
  useEffect(() => {
    if (params.has("start") || params.has("tense")) setParams({}, { replace: true })
  }, [params, setParams])

  const updateSettings = (next: DrillSettings) => {
    setSettings(next)
    saveDrillSettings(next)
  }

  const start = (round: DrillItem[]) => {
    setEditing(false)
    setPhase({ name: "drill", round, index: 0, answered: [] })
  }

  if (phase.name === "drill") {
    const item = phase.round[phase.index]
    return (
      <LearnPageShell>
        <DrillCard
          key={phase.index}
          item={item}
          position={phase.index}
          total={phase.round.length}
          onQuit={() => setPhase({ name: "setup" })}
          onAnswered={(grade, typed) => {
            setStats((s) => recordTenseAnswer(s, item.tense, isRight(grade)))
            setPhase({ ...phase, answered: [...phase.answered, { item, grade, typed }] })
          }}
          onNext={() =>
            setPhase(
              phase.index + 1 < phase.round.length
                ? { ...phase, index: phase.index + 1 }
                : { name: "results", round: phase.round, answered: phase.answered },
            )
          }
        />
      </LearnPageShell>
    )
  }

  if (phase.name === "results") {
    const missed = phase.answered.filter((a) => !isRight(a.grade))
    return (
      <LearnPageShell back={{ to: "/learn", label: "Learn" }}>
        <RoundResults
          answered={phase.answered}
          onAgain={() => start(buildRound(settings, stats))}
          onMisses={missed.length > 0 ? () => start(buildMissesRound(missed.map((m) => m.item))) : undefined}
          onDone={() => navigate("/learn")}
        />
      </LearnPageShell>
    )
  }

  const weak = settings.tenses.length > 1 ? weakestTense(settings.tenses, stats) : null
  const practiced = TENSES.filter((t) => stats[t.id])

  return (
    <LearnPageShell back={{ to: "/learn", label: "Learn" }}>
      <LearnHeading
        eyebrow="Conjugación"
        title="Conjugation practice"
        lede="Short rounds of ten. Some ask for the bare form, some put the verb in a real sentence."
      />

      {editing ? (
        <DrillOptions settings={settings} onChange={updateSettings} />
      ) : (
        <p className="text-base text-foreground">
          Practicing the <span className="font-medium">{listTenses(settings.tenses)}</span>
          {weak && <>, with extra {weak.tense.name.toLowerCase()}</>}.{" "}
          <button type="button" onClick={() => setEditing(true)} className="text-primary underline underline-offset-4">
            Change
          </button>
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button size="lg" className="rounded-full px-8" onClick={() => start(buildRound(settings, stats))}>
          Start a round
        </Button>
        {editing ? (
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-primary underline underline-offset-4">
            Done
          </button>
        ) : (
          <span className="text-sm text-muted-foreground">About three minutes</span>
        )}
      </div>

      <section className="mt-12">
        <h2 className="mb-3 font-serif text-xl text-foreground">Your tenses</h2>
        {practiced.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            After your first round, you&apos;ll see how you&apos;re doing in each tense here. Rounds lean toward the ones
            you miss.
          </p>
        ) : (
          <ul className="border-t border-border">
            {practiced.map((t) => {
              const s = stats[t.id]!
              const pct = Math.round((100 * s.right) / s.total)
              return (
                <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.8rem] items-center gap-3.5 border-b border-border py-2.5 text-sm">
                  <span className="text-foreground">{t.name}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </span>
                  <span className={cn("text-right tabular-nums", pct < 70 ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                    {pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </LearnPageShell>
  )
}

function DrillOptions({ settings, onChange }: { settings: DrillSettings; onChange: (s: DrillSettings) => void }) {
  const toggleTense = (id: TenseId) => {
    const tenses = settings.tenses.includes(id)
      ? settings.tenses.filter((t) => t !== id)
      : TENSE_IDS.filter((t) => t === id || settings.tenses.includes(t))
    // Keep at least one tense picked.
    if (tenses.length > 0) onChange({ ...settings, tenses })
  }
  const presets: [string, TenseId[]][] = [
    ["Past tenses", ["preterite", "imperfect", "perfect"]],
    ["Subjunctive", ["subj", "impsubj"]],
    ["Everything", [...TENSE_IDS]],
  ]
  return (
    <div className="flex flex-col gap-6">
      <div>
        <OptionLabel>Tenses</OptionLabel>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {TENSES.map((t) => {
            const on = settings.tenses.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTense(t.id)}
                className={cn(
                  "flex min-w-0 flex-col rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                  on ? "border-primary bg-primary/[0.07]" : "border-border hover:border-primary/50",
                )}
              >
                <span className={cn("text-sm font-medium", on ? "text-primary" : "text-foreground")}>{t.name}</span>
                <span className="font-reading text-base italic text-muted-foreground">{t.example}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {presets.map(([label, tenses]) => (
            <button key={label} type="button" onClick={() => onChange({ ...settings, tenses })} className="text-primary underline underline-offset-4">
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <OptionLabel>Verbs</OptionLabel>
        <Segmented<VerbSet>
          value={settings.verbs}
          options={[
            ["common", "Common verbs"],
            ["irregular", "Irregulars only"],
          ]}
          onChange={(verbs) => onChange({ ...settings, verbs })}
        />
      </div>
      <div>
        <OptionLabel>Questions</OptionLabel>
        <Segmented<QuestionMode>
          value={settings.mode}
          options={[
            ["mixed", "Mixed"],
            ["bare", "Forms only"],
            ["sentences", "In sentences"],
          ]}
          onChange={(mode) => onChange({ ...settings, mode })}
        />
      </div>
    </div>
  )
}

function OptionLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-2.5 block text-label-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</span>
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-full border border-border p-[3px]" role="group">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm transition-colors",
            value === v ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function DrillCard({
  item,
  position,
  total,
  onQuit,
  onAnswered,
  onNext,
}: {
  item: DrillItem
  position: number
  total: number
  onQuit: () => void
  onAnswered: (grade: Grade, typed: string) => void
  onNext: () => void
}) {
  const [typed, setTyped] = useState("")
  const [result, setResult] = useState<{ grade: Grade; revealed: boolean } | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const inputRef = useRef<{ focus: () => void }>(null)

  useEffect(() => {
    if (!result) inputRef.current?.focus()
  }, [result])

  // Once answered, Enter anywhere moves on (a focused button or link keeps its own Enter).
  useEffect(() => {
    if (!result) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest("button, a, textarea, select")) return
      e.preventDefault()
      onNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [result, onNext])

  const answer = (revealed: boolean) => {
    if (result || (!revealed && !typed.trim())) return
    // Showing the answer grades an empty answer: wrong, with the form to show.
    const grade = gradeConjugation(item.verb, item.tense, item.person, revealed ? "" : typed)
    setResult({ grade, revealed })
    onAnswered(grade, revealed ? "" : typed.trim())
  }

  const meaning = DRILL_VERB_MEANING[item.verb]
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        answer(false)
      }}
    >
      <DrillTopBar value={position / total} label={`${position + 1} of ${total}`} onClose={onQuit} closeLabel="End round" />
      <div className="pt-8 sm:pt-12">
        <p className="text-label-2xs font-semibold uppercase tracking-[0.15em] text-accent">{TENSE_NAME[item.tense]}</p>
        {item.kind === "bare" ? (
          <>
            <p
              data-testid="drill-verb"
              className="mt-1.5 font-serif text-[2.8rem] font-medium leading-none tracking-tight text-foreground sm:text-[3.3rem]"
            >
              {item.verb}
            </p>
            {meaning && <p className="mt-1.5 text-[0.95rem] text-muted-foreground">{meaning}</p>}
            <p className="mt-5 font-reading text-[1.35rem] text-foreground">
              <span className="font-medium" data-testid="drill-person">
                {PERSON_LABEL[item.person]}
              </span>{" "}
              …
            </p>
          </>
        ) : (
          <>
            <BlankSentence
              text={item.text}
              filled={result ? result.grade.answer : undefined}
              right={result ? isRight(result.grade) : undefined}
              className="mt-2.5"
            />
            <p className="mt-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{item.verb}</span> · {PERSON_SHORT[item.person]}
              {meaning && <> · {meaning}</>}
            </p>
          </>
        )}

        <ConjugationInput ref={inputRef} value={typed} onChange={setTyped} readOnly={result != null} />

        {result && (
          <GradeFeedback grade={result.grade} tense={item.tense} person={item.person} revealed={result.revealed}>
            {item.kind === "sentence" &&
              (showWhy ? (
                <p className="mt-1.5 border-t border-border pt-2.5 text-sm text-muted-foreground">{item.why}</p>
              ) : (
                <button type="button" onClick={() => setShowWhy(true)} className="self-start text-sm text-primary underline underline-offset-4">
                  Why this tense?
                </button>
              ))}
          </GradeFeedback>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          {result ? (
            <>
              <Button type="button" className="rounded-full px-7" onClick={onNext}>
                {position + 1 === total ? "See results" : "Next"}
              </Button>
              <span className="text-xs text-muted-foreground max-sm:hidden">Enter ↵</span>
            </>
          ) : (
            <>
              <Button type="submit" className="rounded-full px-7" disabled={!typed.trim()}>
                Check
              </Button>
              <button type="button" onClick={() => answer(true)} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Show answer
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  )
}

function RoundResults({
  answered,
  onAgain,
  onMisses,
  onDone,
}: {
  answered: Answered[]
  onAgain: () => void
  onMisses?: () => void
  onDone: () => void
}) {
  const right = answered.filter((a) => isRight(a.grade)).length
  const missed = answered.filter((a) => !isRight(a.grade))
  const message =
    right === answered.length ? "A clean round." : right >= 7 ? "Nicely done." : "Good practice. The misses below are worth another pass."
  return (
    <div>
      {right === answered.length && <Confetti />}
      <p className="text-label-2xs font-semibold uppercase tracking-[0.15em] text-accent">Round complete</p>
      <p className="mt-2 font-serif text-[4rem] font-medium leading-none tracking-tight text-foreground tabular-nums">
        {right}
        <span className="text-[0.4em] tracking-normal text-muted-foreground"> / {answered.length}</span>
      </p>
      <p className="mt-2 text-muted-foreground">{message}</p>
      {missed.length > 0 && (
        <ul className="mt-6 border-t border-border">
          {missed.map(({ item, grade, typed }, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3">
              <span className="text-sm text-muted-foreground">
                {item.verb} · {TENSE_NAME[item.tense].toLowerCase()} · {PERSON_SHORT[item.person]}
              </span>
              <span className="font-reading text-lg">
                {typed && <span className="mr-2 text-red-700 line-through dark:text-red-300">{typed}</span>}
                <span className="text-foreground">{grade.answer}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {missed.length === 0 && (
        <p className="mt-6 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4" aria-hidden /> Every answer right.
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button className="rounded-full px-7" onClick={onAgain}>
          Another round
        </Button>
        {onMisses && (
          <Button variant="outline" className="rounded-full px-7" onClick={onMisses}>
            Practice my misses
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
