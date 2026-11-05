import { useLayoutEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { useLanguageLearningPreferences } from "@/hooks/use-language-learning-preferences"
import { LEARNING_LANGUAGE_LABEL, type LearningLanguage } from "@/lib/storage/language-learning-preferences"
import { cn } from "@/lib/utils"

/**
 * Frame shared by the Learn pages: the scroll surface, an optional back link, and a
 * language gate. Conjugation only exists for Spanish; lessons exist for Spanish and French.
 */
export function LearnPageShell({
  back,
  className,
  languages = ["spanish"],
  children,
}: {
  back?: { to: string; label: string }
  className?: string
  /** "I'm learning" languages this page has content for; others see a pointer to Settings. */
  languages?: LearningLanguage[]
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const { registerNewChat } = useLandingShellNewChat()
  const { learning } = useLanguageLearningPreferences()

  useLayoutEffect(() => {
    document.documentElement.classList.add("mobile-scroll-discover")
    return () => document.documentElement.classList.remove("mobile-scroll-discover")
  }, [])
  useLayoutEffect(() => {
    registerNewChat(() => navigate("/"))
    return () => registerNewChat(null)
  }, [navigate, registerNewChat])

  return (
    <div className="discover-scroll-surface flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] font-sans">
      <main
        className={cn(
          "animate-fade-in-up mx-auto w-full max-w-2xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6 md:pt-10 lg:pt-12",
          className,
        )}
      >
        {back && (
          <Link
            to={back.to}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-8"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> {back.label}
          </Link>
        )}
        {languages.includes(learning) ? (
          children
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            This is {languages.map((l) => LEARNING_LANGUAGE_LABEL[l]).join(" and ")} only for now.{" "}
            {LEARNING_LANGUAGE_LABEL[learning]} practice is on the way. You can switch
            the language you&apos;re learning in{" "}
            <Link to="/settings" className="text-primary underline underline-offset-2">
              Settings
            </Link>
            .
          </div>
        )}
      </main>
    </div>
  )
}

/** The small italic eyebrow + serif title used across the Learn pages. */
export function LearnHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <header className="discover-masthead !mb-6">
      <div className="min-w-0 flex-1">
        <p className="discover-masthead__eyebrow">{eyebrow}</p>
        <h1 className="discover-masthead__title text-balance">{title}</h1>
        {lede && <p className="discover-masthead__lede">{lede}</p>}
      </div>
    </header>
  )
}
