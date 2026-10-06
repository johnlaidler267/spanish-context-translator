import { useState } from "react"
import { Link } from "react-router-dom"
import { Check } from "lucide-react"
import { LearnHeading, LearnPageShell } from "@/components/learn/learn-page-shell"
import { LESSON_LEVEL_NAME, LESSON_LEVELS, LESSONS } from "@/lib/learn/lessons"
import { loadCompletedLessons } from "@/lib/learn/progress-storage"

/** The list of mini lessons, grouped by level in suggested order; finished ones are ticked. */
export default function LearnLessonsPage() {
  const [done] = useState(loadCompletedLessons)
  return (
    <LearnPageShell back={{ to: "/learn", label: "Learn" }}>
      <LearnHeading
        eyebrow="Lecciones"
        title="One idea at a time"
        lede="Each lesson takes a few minutes: a short explanation, a couple of examples, then a few chances to try it."
      />
      {LESSON_LEVELS.map((level) => {
        const lessons = LESSONS.filter((l) => l.level === level)
        if (lessons.length === 0) return null
        return (
          <section key={level} aria-labelledby={`lessons-${level}`} className="mt-8 first:mt-0">
            <h2 id={`lessons-${level}`} className="mb-2 text-label-2xs font-semibold uppercase tracking-[0.15em] text-accent">
              {LESSON_LEVEL_NAME[level]}
            </h2>
            <ul className="border-t border-border">
              {lessons.map((l) => (
                <li key={l.id} className="border-b border-border">
                  <Link to={`/learn/lessons/${l.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-4">
                    <span className="font-serif text-xl font-medium text-foreground transition-colors group-hover:text-primary">{l.title}</span>
                    {done.includes(l.id) ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden /> Done · {l.minutes} min
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-sm font-medium text-primary">Start · {l.minutes} min</span>
                    )}
                    <span className="font-reading text-base italic text-muted-foreground">{l.sample}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </LearnPageShell>
  )
}
