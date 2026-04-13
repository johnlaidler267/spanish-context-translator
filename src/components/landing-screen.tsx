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
import { useVirtualKeyboardLayoutFix } from "@/hooks/use-virtual-keyboard-layout-fix"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import { useAuth } from "@/contexts/auth-context"
import { useSubscription } from "@/contexts/subscription-context"
import { supabase } from "@/lib/supabase"
import { getTier, type TierId } from "@/lib/tiers"
import { pricingUiPlanIdFromRow, type SubscriptionRowLike } from "@/lib/subscription-display"
import { MainHeader } from "./main-header"
import { LandingContentPills } from "./landing-content-pills"
import {
  appendTranscriptToField,
  fetchLearnRandomParagraph,
  generateRandomSpanish,
} from "@/lib/translate"
import { VoiceInputButton } from "./voice-input-button"
import { AppErrorModal } from "./app-error-modal"
import type { ReadingTheme } from "./theme-toggle"

interface LandingScreenProps {
  draftText: string
  onDraftChange: Dispatch<SetStateAction<string>>
  onSubmit: (text: string) => void
  isLoading: boolean
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
  displayName: string
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
  onThemeChange,
  displayName,
}: LandingScreenProps) {
  const { user } = useAuth()
  const { status: subscriptionStatus } = useSubscription()
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

  const landingHidePlanBanner =
    subscriptionRowForPlan?.status === "active" &&
    subscriptionRowForPlan?.plan_id === "pro"

  const [charLimitTipOpen, setCharLimitTipOpen] = useState(false)
  const charLimitTipWrapRef = useRef<HTMLDivElement>(null)

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
  const showCharLimitCounter = charsPerSubmissionLimit != null
  const submissionCharCount = text.trim().length
  const charCountOverLimit =
    showCharLimitCounter && submissionCharCount > charsPerSubmissionLimit

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
        generateRandomSpanish(),
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

  return (
    <>
    <div className="landing-route-shell landing-route-enter relative z-10 flex w-full flex-col min-h-app max-md:min-h-0 max-md:flex-1">
      <MainHeader theme={theme} onThemeChange={onThemeChange} showPlanBanner={!landingHidePlanBanner} />
      <div
        className="landing-page flex flex-col items-stretch md:items-center md:justify-start md:pt-[clamp(3.5rem,10vh,6.5rem)] min-h-app max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden px-3 md:px-8"
        style={{ position: "relative" }}
      >
        <img
          src={theme === "dark" ? "/landing-bg-dark.png" : "/landing-bg.png"}
          aria-hidden
          className={
            theme === "dark"
              ? "max-md:[filter:none] md:[filter:blur(2.3px)]"
              : "[filter:none]"
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
        className="landing-column w-full max-w-[800px] flex flex-col flex-1 min-h-0 max-md:flex-1 max-md:min-h-0 max-md:overflow-hidden max-md:overflow-x-hidden md:flex-none md:justify-start gap-4 md:gap-6 max-md:pt-[max(7.5rem,calc(env(safe-area-inset-top,0px)+5.75rem))] md:pt-0"
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* Hero — mobile: fills space above composer; desktop: top */}
        <div className="hero-mark hero-mark--literary text-center relative entry-1 order-1 flex flex-col flex-1 justify-center items-center min-h-0 max-md:overflow-y-auto md:flex-none md:overflow-visible md:block md:pb-8 pt-2 md:pt-0 pb-2 md:pb-8">
          <img
            src="/landing-hero-books.png"
            alt=""
            width={72}
            height={72}
            className="md:hidden mx-auto mb-2 w-[min(35vw,15rem)] h-auto max-h-18 object-contain object-center select-none pointer-events-none animate-levitate"
            aria-hidden
          />
          <h1 className="wordmark font-normal text-3xl sm:text-4xl md:text-5xl" style={{ lineHeight: "1.15" }}>
            <em>Hola</em>
            {displayName ? (
              <>
                {" "}
                <em>{displayName}</em>, ready to read?
              </>
            ) : (
              ", ready to read?"
            )}
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
              randomPending={isRolling}
              learnPending={isLearning}
              disabled={isLoading}
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
                  <div className="textarea-toolbar-left" ref={charLimitTipWrapRef}>
                    <button
                      type="button"
                      className={`char-limit-counter${charCountOverLimit ? " char-limit-counter--over" : ""}`}
                      aria-expanded={charLimitTipOpen}
                      aria-haspopup="dialog"
                      aria-label="Submission character limit. Tap for details."
                      onClick={() => setCharLimitTipOpen((o) => !o)}
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
                      <div className="char-limit-tip" role="dialog" aria-label="Upgrade for unlimited">
                        <p className="char-limit-tip-text">
                          Upgrade your plan for unlimited characters per submission.
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

        {/* Sample excerpt — desktop/tablet only */}
        <div className="sample-text w-full entry-4 order-3 md:order-3 mt-0 md:-mt-4 hidden md:block">
          <p className="sample-excerpt-label">Sample text</p>
          <button onClick={handleTrySample} disabled={isLoading} className="sample-excerpt-btn text-left w-full group">
            <p className="sample-paragraph font-serif text-[15px] overflow-hidden">El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles…</p>
            <span className="sample-link mt-3 inline-flex items-center gap-2">
              Try this sample
              <span className="sample-link-arrow inline-block transition-transform ease-in-out duration-200 group-hover:translate-x-[3px]" aria-hidden>→</span>
            </span>
          </button>
        </div>
      </div>
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
    </>
  )
}
