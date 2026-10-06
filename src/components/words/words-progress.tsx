import { savedThisWeek, type ListedWord, type WordStatus } from "@/lib/word-list"
import { cn } from "@/lib/utils"

/** Most-known first, so the bar fills from the left as words are learned. One hue, strong to faint. */
const SEGMENTS: { status: WordStatus; swatch: string }[] = [
  { status: "learned", swatch: "bg-primary" },
  { status: "learning", swatch: "bg-primary/55" },
  { status: "due", swatch: "bg-primary/30" },
  { status: "new", swatch: "bg-muted-foreground/20" },
]

/**
 * Progress card at the top of the Words page: how many saved words are learned, a bar split by
 * practice status (same statuses as the filter chips, see word-list.ts), and how many were saved
 * this week. Everything comes from the words already loaded -- no extra requests.
 */
export function WordsProgress({ words, counts }: { words: ListedWord[]; counts: Record<WordStatus, number> }) {
  const thisWeek = savedThisWeek(words, new Date())
  return (
    <section aria-label="Your progress" className="mb-8 rounded-2xl border border-border/70 bg-card/60 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="font-serif text-4xl leading-none tabular-nums text-foreground">{counts.learned}</span>
        <span className="font-serif text-base italic text-muted-foreground">
          of {words.length} {words.length === 1 ? "word" : "words"} learned
        </span>
        {thisWeek > 0 && (
          <span className="ml-auto whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            +{thisWeek} this week
          </span>
        )}
      </div>
      <div aria-hidden className="mt-4 flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {SEGMENTS.filter((s) => counts[s.status] > 0).map((s) => (
          <span
            key={s.status}
            title={`${counts[s.status]} ${s.status}`}
            className={cn("h-full transition-[flex-grow] duration-700 ease-out", s.swatch)}
            style={{ flexGrow: counts[s.status], flexBasis: 0 }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SEGMENTS.map((s) => (
          <li key={s.status} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.swatch)} aria-hidden />
            <span className="tabular-nums text-foreground/80">{counts[s.status]}</span> {s.status}
          </li>
        ))}
      </ul>
    </section>
  )
}
