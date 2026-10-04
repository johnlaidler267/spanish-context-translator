import { Link } from "react-router-dom"
import { LearnHeading, LearnPageShell } from "@/components/learn/learn-page-shell"
import { LESSONS, UPCOMING_LESSONS } from "@/lib/learn/lessons"

/** The list of mini lessons; ones not written yet show as coming soon. */
export default function LearnLessonsPage() {
  return (
    <LearnPageShell back={{ to: "/learn", label: "Learn" }}>
      <LearnHeading
        eyebrow="Lecciones"
        title="One idea at a time"
        lede="Each lesson takes a few minutes: a short explanation, a couple of examples, then a few chances to try it."
      />
      <ul className="border-t border-border">
        {LESSONS.map((l) => (
          <li key={l.id} className="border-b border-border">
            <Link to={`/learn/lessons/${l.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-4">
              <span className="font-serif text-xl font-medium text-foreground transition-colors group-hover:text-primary">{l.title}</span>
              <span className="whitespace-nowrap text-sm font-medium text-primary">Start · {l.minutes} min</span>
              <span className="font-reading text-base italic text-muted-foreground">{l.sample}</span>
            </Link>
          </li>
        ))}
        {UPCOMING_LESSONS.map((l) => (
          <li key={l.title} className="border-b border-border opacity-55">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-4">
              <span className="font-serif text-xl font-medium text-foreground">{l.title}</span>
              <span className="whitespace-nowrap text-sm text-muted-foreground">Coming soon</span>
              <span className="font-reading text-base italic text-muted-foreground">{l.sample}</span>
            </div>
          </li>
        ))}
      </ul>
    </LearnPageShell>
  )
}
