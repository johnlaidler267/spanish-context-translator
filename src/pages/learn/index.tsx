import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { LearnPageShell } from "@/components/learn/learn-page-shell"
import { LearnChoiceCard, VerbWheel, WarmUpCard } from "@/components/learn/learn-hub-parts"
import { listTenses } from "@/lib/learn/conjugation"
import { buildWarmUp, weakestTense } from "@/lib/learn/drill-round"
import { LESSONS } from "@/lib/learn/lessons"
import { loadCompletedLessons, loadDrillSettings, loadTenseStats, recordTenseAnswer } from "@/lib/learn/progress-storage"

/** Learn landing: a warm-up question, then the way into conjugation drills or mini lessons. */
export default function LearnPage() {
  const navigate = useNavigate()
  const [settings] = useState(loadDrillSettings)
  const [stats, setStats] = useState(loadTenseStats)
  const [warmUp, setWarmUp] = useState(() => buildWarmUp())
  // Bumped for "Another one" so the card remounts with its answer cleared.
  const [warmUpKey, setWarmUpKey] = useState(0)

  const weak = weakestTense(settings.tenses, stats)
  const [completed] = useState(loadCompletedLessons)
  const nextLesson = LESSONS.find((l) => !completed.includes(l.id))

  return (
    // Wider than the other Learn pages: on desktop the intro and warm-up sit side by side, and
    // the two cards share a row, instead of one narrow column down the middle of the window.
    <LearnPageShell className="max-w-5xl">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
        <div>
          <p className="discover-masthead__eyebrow">Aprende</p>
          <VerbWheel />
          <h1 className="text-balance font-serif text-[2rem] font-medium leading-[1.05] tracking-tight text-foreground sm:text-[2.4rem]">
            One verb, every way you&apos;ll meet it.
          </h1>
          <p className="mt-2.5 max-w-md text-[0.98rem] text-muted-foreground">
            A few focused minutes on the forms and grammar behind what you read.
          </p>
        </div>

        <div className="mt-8 lg:mt-0">
          <WarmUpCard
            key={warmUpKey}
            warmUp={warmUp}
            onAnswer={(right) => setStats((s) => recordTenseAnswer(s, warmUp.sentence.tense, right))}
            onAnother={() => {
              setWarmUp(buildWarmUp())
              setWarmUpKey((k) => k + 1)
            }}
            onKeepGoing={() => navigate("/learn/conjugation?start=1")}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-3.5 md:grid-cols-2 lg:mt-12 lg:gap-5">
        <LearnChoiceCard
          to="/learn/conjugation"
          variant="conjugation"
          title="Conjugation practice"
          description="Drill verb forms in short rounds of ten."
          next={
            <>
              Up next: <span className="font-medium text-foreground">{listTenses(settings.tenses)}</span>
              {weak && settings.tenses.length > 1 && (
                <>
                  , with extra {weak.tense.name.toLowerCase()} ({Math.round(weak.accuracy * 100)}%)
                </>
              )}
            </>
          }
          action="10 questions"
        />
        <LearnChoiceCard
          to="/learn/lessons"
          variant="lessons"
          title="Mini lessons"
          description="One grammar idea, explained simply, then practiced."
          next={
            nextLesson ? (
              <>
                Up next: <span className="font-medium text-foreground">{nextLesson.title}</span> · {nextLesson.minutes} min
              </>
            ) : (
              <>All {LESSONS.length} done. Revisit any of them.</>
            )
          }
          action={`${LESSONS.length} lessons`}
        />
      </div>
    </LearnPageShell>
  )
}
