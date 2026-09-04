"use client"

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react"
import { Link } from "react-router-dom"
import { useLandingShellNewChat } from "@/components/landing/landing-shell-layout"
import { useVirtualKeyboardLayoutFix } from "@/hooks/use-virtual-keyboard-layout-fix"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import { useAuth } from "@/contexts/auth-context"
import { useSubscription } from "@/contexts/subscription-context"
import { supabase } from "@/lib/supabase"
import { getTier, type TierId } from "@/lib/subscription/tiers"
import { pricingUiPlanIdFromRow, type SubscriptionRowLike } from "@/lib/subscription/subscription-display"
import { LandingContentPills } from "@/components/landing/landing-content-pills"
import { LandingContinueReading } from "@/components/landing/landing-continue-reading"
import type { ContentItem } from "@/lib/discover/content-data"
import {
  appendTranscriptToField,
  fetchLearnRandomParagraph,
  generateRandomLearningParagraph,
} from "@/lib/translate"
import {
  getStoredLanguageLearningPreferences,
  landingGreetingWord,
  LANGUAGE_LEARNING_PREFS_UPDATED_EVENT,
  LANGUAGE_LEARNING_PREFERENCES_KEY,
  type LanguageLearningPreferences,
} from "@/lib/storage/language-learning-preferences"
import { VoiceInputButton } from "@/components/reading/voice-input-button"
import { AppErrorModal } from "@/components/app-error-modal"
import { Button } from "@/components/ui/button"
import type { ReadingTheme } from "@/components/reading/theme-toggle"

interface LandingScreenProps {
  draftText: string
  onDraftChange: Dispatch<SetStateAction<string>>
  onSubmit: (text: string) => void
  isLoading: boolean
  theme: ReadingTheme
  displayName: string
  /** Opens a Discover item straight into reading (desktop Continue Reading row). */
  onContinueReading: (content: ContentItem) => void
}

const LANDING_SUB_ROW_CACHE = "lexa.landingSubRow.v1"

function readCachedSubscriptionRow(userId: string): SubscriptionRowLike | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = sessionStorage.getItem(`${LANDING_SUB_ROW_CACHE}:${userId}`)
    if (raw == null) return undefined
    if (raw === "__null__") return null
    return JSON.parse(raw) as SubscriptionRowLike
  } catch {
    return undefined
  }
}

function writeCachedSubscriptionRow(userId: string, row: SubscriptionRowLike) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      `${LANDING_SUB_ROW_CACHE}:${userId}`,
      row == null ? "__null__" : JSON.stringify(row),
    )
  } catch {
    /* quota / private mode */
  }
}

/** Silent backoff before surfacing pill fetch errors (matches translation auto-retry spirit). */
const PILL_FETCH_RETRY_DELAYS_MS = [0, 800, 2000, 4000] as const

async function fetchLandingSnippetWithRetries<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let i = 0; i < PILL_FETCH_RETRY_DELAYS_MS.length; i++) {
    const delay = PILL_FETCH_RETRY_DELAYS_MS[i] ?? 0
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    try {
      return await fn()
    } catch (e) {
      last = e
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

const PLACEHOLDERS = [
  "Paste in an article…",
  "Drop in a tweet…",
  "Try a WhatsApp message…",
  "Paste a menu, sign, or label…",
  "Add lyrics from a song…",
  "Paste a paragraph from a novel…",
  "Try something from the news…",
  "Paste a conversation…",
]

export function LandingScreen({
  draftText: text,
  onDraftChange: setText,
  onSubmit,
  isLoading,
  theme,
  displayName,
  onContinueReading,
}: LandingScreenProps) {
  const { user } = useAuth()
  const { status: subscriptionStatus, isLapsed } = useSubscription()
  const cachedSubscriptionRow = useMemo(
    () => (user?.id ? readCachedSubscriptionRow(user.id) : undefined),
    [user?.id],
  )
  /** `undefined` = fetch not finished this session; then fall back to cache or free. */
  const [fetchedSubscriptionRow, setFetchedSubscriptionRow] = useState<
    SubscriptionRowLike | null | undefined
  >(undefined)

  const subscriptionRowForPlan: SubscriptionRowLike | null =
    user == null
      ? null
      : fetchedSubscriptionRow !== undefined
        ? fetchedSubscriptionRow
        : cachedSubscriptionRow !== undefined
          ? cachedSubscriptionRow
          : null

  const [charLimitTipOpen, setCharLimitTipOpen] = useState(false)
  const [charLimitTipHoverEnabled, setCharLimitTipHoverEnabled] = useState(false)
  const charLimitTipWrapRef = useRef<HTMLDivElement>(null)

  const [langPrefs, setLangPrefs] = useState<LanguageLearningPreferences>(() =>
    getStoredLanguageLearningPreferences(),
  )

  useEffect(() => {
    const sync = () => setLangPrefs(getStoredLanguageLearningPreferences())
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANGUAGE_LEARNING_PREFERENCES_KEY) sync()
    }
    window.addEventListener(LANGUAGE_LEARNING_PREFS_UPDATED_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(LANGUAGE_LEARNING_PREFS_UPDATED_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setFetchedSubscriptionRow(undefined)
      return
    }
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("plan_id, status, trial_end")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .maybeSingle<{
          plan_id: string
          status: string
          trial_end: string | null
        }>()
      if (cancelled) return
      setFetchedSubscriptionRow(data)
      writeCachedSubscriptionRow(user.id, data)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, subscriptionStatus])

  const effectivePlanId: TierId = !user ? "free" : pricingUiPlanIdFromRow(subscriptionRowForPlan)
  const charsPerSubmissionLimit = getTier(effectivePlanId).limits.charsPerSubmission
  const submissionCharCount = text.trim().length
  const showCharLimitCounter = charsPerSubmissionLimit != null && submissionCharCount > 0
  const charCountOverLimit =
    showCharLimitCounter && submissionCharCount > charsPerSubmissionLimit

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)")
    const sync = () => setCharLimitTipHoverEnabled(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!charLimitTipOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const el = charLimitTipWrapRef.current
      if (el && !el.contains(e.target as Node)) setCharLimitTipOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [charLimitTipOpen])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const landingColumnRef = useRef<HTMLDivElement>(null)
  const composerFormRef = useRef<HTMLFormElement>(null)
  const composerSubmitBtnRef = useRef<HTMLButtonElement>(null)
  const { registerNewChat } = useLandingShellNewChat()
  const handleNewChat = useCallback(() => {
    setText("")
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [setText])
  useLayoutEffect(() => {
    registerNewChat(handleNewChat)
    return () => registerNewChat(null)
  }, [registerNewChat, handleNewChat])
  useVirtualKeyboardLayoutFix(landingColumnRef)
  const [isRolling, setIsRolling] = useState(false)
  const [isLearning, setIsLearning] = useState(false)
  const [learnError, setLearnError] = useState<string | null>(null)
  const [learnErrorKind, setLearnErrorKind] = useState<"random" | "learn" | null>(
    null,
  )
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)
  const [focused, setFocused] = useState(false)

  const epubFileInputRef = useRef<HTMLInputElement>(null)
  const [isParsingEpub, setIsParsingEpub] = useState(false)
  const [epubError, setEpubError] = useState<string | null>(null)
  /** Set only when the parsed book had to be cut down for a free-plan preview -- confirmed before submitting. */
  const [epubPreviewConfirm, setEpubPreviewConfirm] = useState<{
    truncatedText: string
    limit: number
    bookTitle: string | null
  } | null>(null)

  /* Extend overflow unlock while landing enter animation runs (mobile shell clips transforms otherwise). */
  useEffect(() => {
    beginRouteTransition(560)
    return () => cancelRouteTransition()
  }, [])

  useEffect(() => {
    if (text) return
    const interval = setInterval(() => {
      setPlaceholderVisible(false)
      setTimeout(() => {
        setPlaceholderIndex(i => (i + 1) % PLACEHOLDERS.length)
        setPlaceholderVisible(true)
      }, 400)
    }, 3000)
    return () => clearInterval(interval)
  }, [text])

  const handleRandomPill = async () => {
    if (isRolling) return
    setLearnError(null)
    setLearnErrorKind(null)
    setIsRolling(true)
    try {
      const paragraph = await fetchLandingSnippetWithRetries<string>(() =>
        generateRandomLearningParagraph(),
      )
      setText(paragraph)
    } catch (e) {
      setLearnErrorKind("random")
      setLearnError(e instanceof Error ? e.message : "No se pudo generar el texto.")
    } finally {
      setIsRolling(false)
    }
  }

  const handleLearnPill = async () => {
    if (isLearning || isLoading) return
    setLearnError(null)
    setLearnErrorKind(null)
    setIsLearning(true)
    try {
      const intro = await fetchLandingSnippetWithRetries<string>(() =>
        fetchLearnRandomParagraph(),
      )
      setText(intro)
    } catch (e) {
      setLearnErrorKind("learn")
      setLearnError(e instanceof Error ? e.message : "No se pudo generar el texto.")
    } finally {
      setIsLearning(false)
    }
  }

  const sampleText = `El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles. Ella pensaba en su abuela, quien siempre le contaba historias de este lugar mágico.`

  const handleUploadPillClick = () => {
    if (isLoading || isParsingEpub) return
    epubFileInputRef.current?.click()
  }

  const handleEpubFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so selecting the same file again still fires a change event.
    e.target.value = ""
    if (!file) return

    setEpubError(null)
    setIsParsingEpub(true)
    try {
      // Lazy: pulls in jszip, only needed once someone actually uploads a book -- keeps
      // that weight out of the landing page's main bundle (see lazyRoute for the same
      // reasoning applied to whole routes, in src/lib/lazy-route.ts).
      const { parseEpub, truncateForPreview } = await import("@/lib/epub/parse-epub")
      const { text: fullText, title } = await parseEpub(file)

      // Mirrors the "is this user effectively on the free plan" check in handleTextSubmit
      // (src/App.tsx) -- same criteria, so an upload is previewed exactly when a paste of
      // the same length would otherwise be hard-rejected there.
      const freeCharLimit = getTier("free").limits.charsPerSubmission
      const isEffectivelyFreeUser =
        user != null && (subscriptionStatus == null || subscriptionStatus === "free" || isLapsed)

      if (isEffectivelyFreeUser && freeCharLimit != null && fullText.length > freeCharLimit) {
        const truncatedText = truncateForPreview(fullText, freeCharLimit)
        setText(truncatedText)
        setEpubPreviewConfirm({ truncatedText, limit: freeCharLimit, bookTitle: title })
      } else {
        setText(fullText)
        onSubmit(fullText)
      }
    } catch (err) {
      setEpubError(
        err instanceof Error && err.name === "EpubParseError"
          ? err.message
          : "Couldn't read this EPUB file. Make sure it's a valid .epub and try again.",
      )
    } finally {
      setIsParsingEpub(false)
    }
  }

  const confirmEpubPreviewAndSubmit = () => {
    if (!epubPreviewConfirm) return
    const { truncatedText } = epubPreviewConfirm
    setEpubPreviewConfirm(null)
    onSubmit(truncatedText)
  }

  const handleComposerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!text.trim() || isLoading) return
    onSubmit(text.trim())
  }

  /**
   * iOS Safari: tapping submit after editing often blurs the textarea first; the keyboard
   * dismisses and the viewport jumps, and the synthetic `click` never fires. A non-passive
   * `touchend` + `preventDefault` + `requestSubmit` runs the form handler; passive:false is
   * required or the browser still synthesizes a duplicate click.
   */
  useLayoutEffect(() => {
    const btn = composerSubmitBtnRef.current
    const form = composerFormRef.current
    if (!btn || !form) return

    const onTouchEnd = (e: TouchEvent) => {
      if (btn.disabled) return
      e.preventDefault()
      try {
        form.requestSubmit(btn)
      } catch {
        /* requestSubmit throws if submitter is invalid — ignore */
      }
    }

    btn.addEventListener("touchend", onTouchEnd, { passive: false })
    return () => btn.removeEventListener("touchend", onTouchEnd)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      const form = composerFormRef.current
      const btn = composerSubmitBtnRef.current
      if (form && btn) form.requestSubmit(btn)
    }
  }

  const handleTrySample = () => {
    onSubmit(sampleText)
  }

  /** iOS/Android: when keyboard closes, clear stale scroll offset that leaves a bottom gap */
  const nudgeScrollAfterKeyboard = useCallback(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    const root = document.getElementById("root")
    if (root instanceof HTMLElement && root.scrollTop) root.scrollTop = 0
    const col = landingColumnRef.current
    if (col && col.scrollTop < 160) col.scrollTop = 0
    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      requestAnimationFrame(() => window.scrollTo(0, 0))
    })
  }, [])

  const heroGreeting = landingGreetingWord(langPrefs.learning)
  const heroTailPhrase =
    langPrefs.learning === "english" && langPrefs.native === "spanish"
      ? "listo para leer?"
      : langPrefs.learning === "english" && langPrefs.native === "french"
        ? "prêt à lire ?"
        : "ready to read?"

  return (
    <>
      <div
        className="landing-page flex flex-col items-stretch md:items-center md:justify-start md:pt-20 md:pb-[clamp(3rem,10vh,7rem)] md:overflow-y-auto min-h-app max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden px-3 md:px-8"
        style={{ position: "relative" }}
      >
        <img
          src={theme === "dark" ? "/landing-bg-dark.png" : "/landing-bg.png"}
          aria-hidden
          className={
            theme === "dark"
              ? "landing-bg-art max-md:[filter:none] md:[filter:blur(2.3px)]"
              : "landing-bg-art [filter:none]"
          }
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            opacity: theme === "dark" ? 0.13 : 0.22,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      <div
        className="landing-column w-full max-w-[800px] flex flex-col flex-1 min-h-0 max-md:flex-1 max-md:min-h-0 max-md:overflow-hidden max-md:overflow-x-hidden md:flex-none md:justify-start md:my-auto gap-4 md:gap-6 max-md:pt-[max(7.5rem,calc(env(safe-area-inset-top,0px)+5.75rem))] md:pt-0"
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* Hero — mobile: fills space above composer; desktop: top */}
        <div className="hero-mark hero-mark--literary text-center relative entry-1 order-1 flex flex-col flex-1 justify-center items-center min-h-0 max-md:overflow-y-auto md:flex-none md:overflow-visible md:block md:pb-8 pt-2 md:pt-0 pb-2 md:pb-8">
          <img
            src="/landing-hero-books.webp"
            alt=""
            width={480}
            height={511}
            className="md:hidden mx-auto mb-2 w-[min(35vw,15rem)] h-auto max-h-18 object-contain object-center select-none pointer-events-none animate-levitate"
            aria-hidden
            loading="eager"
            fetchPriority="high"
          />
          <h1 className="wordmark font-normal text-3xl sm:text-4xl md:text-5xl" style={{ lineHeight: "1.15" }}>
            <em>{heroGreeting}</em>
            {displayName ? (
              <>
                {" "}
                <em>{displayName}</em>
              </>
            ) : null}
            ,{" "}
            <span className="wordmark-ink">{heroTailPhrase}</span>
          </h1>
        </div>

        {/* Filigree sits directly above the textbox (mobile); desktop: below textarea, above sample (flex order inside group) */}
        <div className="order-2 md:order-2 flex flex-col gap-2 w-full shrink-0 md:mt-0 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] md:pb-0">
          <img
            src="/filigree-divider.svg"
            alt=""
            className="filigree-divider order-1 md:order-2 mx-auto shrink-0"
            aria-hidden
          />
          <div className="entry-2 order-2 md:order-1 flex flex-col gap-3 w-full">
            <LandingContentPills
              className="order-1 md:order-2"
              onRandom={handleRandomPill}
              onLearn={handleLearnPill}
              onUpload={handleUploadPillClick}
              randomPending={isRolling}
              learnPending={isLearning}
              uploadPending={isParsingEpub}
              disabled={isLoading}
            />
            <input
              ref={epubFileInputRef}
              type="file"
              accept=".epub,application/epub+zip"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void handleEpubFileSelected(e)}
            />
            <div className="order-2 md:order-1 flex flex-col gap-2 w-full">
            <form
              ref={composerFormRef}
              className="contents"
              onSubmit={handleComposerSubmit}
            >
            <div className="textarea-wrapper w-full">
              <span className="corner corner-tl" aria-hidden />
              <span className="corner corner-tr" aria-hidden />
              <span className="corner corner-bl" aria-hidden />
              <span className="corner corner-br" aria-hidden />
              <div className="textarea-input-area">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setFocused(true)}
                  onBlur={() => {
                    setFocused(false)
                    window.setTimeout(nudgeScrollAfterKeyboard, 50)
                  }}
                  placeholder=""
                  className="textarea-field"
                  disabled={isLoading}
                />
                {!text && !focused && (
                  <span className="animated-placeholder" style={{ opacity: placeholderVisible ? 1 : 0 }}>
                    {PLACEHOLDERS[placeholderIndex]}
                  </span>
                )}
              </div>
              <div className="textarea-toolbar" aria-label="Composer actions">
                {showCharLimitCounter && (
                  <div
                    className="textarea-toolbar-left"
                    ref={charLimitTipWrapRef}
                    onPointerEnter={() => {
                      if (charLimitTipHoverEnabled) setCharLimitTipOpen(true)
                    }}
                    onPointerLeave={() => {
                      if (charLimitTipHoverEnabled) setCharLimitTipOpen(false)
                    }}
                    onFocusCapture={() => {
                      if (charLimitTipHoverEnabled) setCharLimitTipOpen(true)
                    }}
                    onBlurCapture={(e) => {
                      if (
                        charLimitTipHoverEnabled &&
                        !e.currentTarget.contains(e.relatedTarget as Node | null)
                      ) {
                        setCharLimitTipOpen(false)
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={`char-limit-counter${charCountOverLimit ? " char-limit-counter--over" : ""}`}
                      aria-expanded={charLimitTipOpen}
                      aria-describedby={charLimitTipOpen ? "char-limit-tip" : undefined}
                      aria-label={
                        charLimitTipHoverEnabled
                          ? "Submission character limit. Hover for details."
                          : "Submission character limit. Tap for details."
                      }
                      onClick={() => {
                        if (!charLimitTipHoverEnabled) setCharLimitTipOpen((o) => !o)
                      }}
                    >
                      <span className="char-limit-counter-value">
                        {submissionCharCount.toLocaleString()}
                      </span>
                      <span className="char-limit-counter-sep" aria-hidden>
                        /
                      </span>
                      <span className="char-limit-counter-max">
                        {charsPerSubmissionLimit.toLocaleString()}
                      </span>
                    </button>
                    {charLimitTipOpen && (
                      <div
                        id="char-limit-tip"
                        className="char-limit-tip"
                        role="tooltip"
                        aria-label="Upgrade for unlimited"
                      >
                        <p className="char-limit-tip-text">
                          Upgrade to Pro for a much higher per-paste limit and generous monthly fair-use allowances.
                        </p>
                        <Link
                          to="/upgrade"
                          className="char-limit-tip-link"
                          onClick={() => setCharLimitTipOpen(false)}
                        >
                          View plans
                        </Link>
                      </div>
                    )}
                  </div>
                )}
                <div className="textarea-toolbar-right">
                  <span className="submit-arrow-label" aria-hidden="true">
                    Translate
                  </span>
                  <button
                    ref={composerSubmitBtnRef}
                    type="submit"
                    disabled={!text.trim() || isLoading}
                    className={`submit-arrow-btn ${text.trim() ? "submit-arrow-btn--visible" : ""}`}
                    aria-label="Start reading"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </button>
                  <VoiceInputButton
                    disabled={isLoading}
                    onTranscript={(t) => setText((prev) => appendTranscriptToField(prev, t))}
                  />
                </div>
              </div>
            </div>
            </form>
            </div>
          </div>
        </div>

        {/* Continue Reading (desktop only) when there's history; otherwise the sample excerpt
            it normally replaces — LandingContinueReading owns that fallback decision. */}
        <LandingContinueReading
          user={user}
          onContinue={onContinueReading}
          fallback={
            <div className="sample-text w-full entry-4 order-3 md:order-3 mt-0 md:mt-2 hidden md:block">
              <p className="sample-excerpt-label text-center">Sample text</p>
              <button onClick={handleTrySample} disabled={isLoading} className="sample-excerpt-btn text-left w-full group">
                <p className="sample-paragraph font-serif text-ui-base overflow-hidden">El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles…</p>
                <span className="mt-3 block text-center">
                  <span className="sample-link inline-flex items-center gap-2">
                    Try this sample
                    <span className="sample-link-arrow inline-block transition-transform ease-in-out duration-200 group-hover:translate-x-[3px]" aria-hidden>→</span>
                  </span>
                </span>
              </button>
            </div>
          }
        />
        </div>
      </div>
      {learnError && (
        <AppErrorModal
          title="Couldn’t load text"
          message={learnError}
          onDismiss={() => {
            setLearnError(null)
            setLearnErrorKind(null)
          }}
          onRetry={() => {
            const kind = learnErrorKind
            setLearnError(null)
            setLearnErrorKind(null)
            if (kind === "random") void handleRandomPill()
            else if (kind === "learn") void handleLearnPill()
          }}
          retryLabel="Try again"
        />
      )}
      {epubError && (
        <AppErrorModal
          title="Couldn’t read this EPUB"
          message={epubError}
          onDismiss={() => setEpubError(null)}
        />
      )}
      {epubPreviewConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/90 backdrop-blur-sm"
            aria-hidden
            onClick={() => setEpubPreviewConfirm(null)}
          />
          <div
            className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="epub-preview-title"
          >
            <h2 id="epub-preview-title" className="font-serif text-2xl font-medium text-foreground mb-2">
              Here’s a free preview
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {epubPreviewConfirm.bookTitle ? <>“{epubPreviewConfirm.bookTitle}” is</> : "This book is"} longer
              than the free plan’s {epubPreviewConfirm.limit.toLocaleString()}-character limit per submission, so
              we’ll read the first part as a preview. Upgrade to Pro to translate the whole book.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button type="button" className="w-full" onClick={confirmEpubPreviewAndSubmit}>
                Continue with preview
              </Button>
              <Link
                to="/upgrade"
                className="text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setEpubPreviewConfirm(null)}
              >
                View plans
              </Link>
              <Button type="button" variant="outline" className="w-full" onClick={() => setEpubPreviewConfirm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
