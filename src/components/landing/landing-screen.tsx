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
import { LandingQuickFillControls } from "@/components/landing/landing-quick-fill-controls"
import { useLandingContinueReading } from "@/components/landing/landing-continue-reading"
import { ContentCard } from "@/pages/discover/content-card"
import { fetchDiscoverCatalog, readCachedDiscoverItems } from "@/lib/discover/discover-catalog"
import type { ContentItem } from "@/lib/discover/content-data"
import type { LibraryEpub } from "@/lib/storage/epub-library"
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
  /** Resumes a personal upload from the same row -- same pipeline as the Library page's own
   *  "start reading" (see handleLibraryStartReading in App.tsx). */
  onContinueLibraryBook: (book: LibraryEpub) => Promise<void> | void
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
  onContinueLibraryBook,
}: LandingScreenProps) {
  const { user, isGuest, openAuthModal } = useAuth()
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

  // Signed-out desktop fallback: a small "Featured reads" row instead of a bare sign-in
  // prompt, so there's something concrete to click into before asking for an account. Reads
  // from the same Discover catalog useLandingContinueReading uses -- fetchDiscoverCatalog
  // shares one in-flight request/localStorage cache across every caller (see its own
  // docstring), so this doesn't add a second network round trip on top of the landing page's
  // existing prefetch (warmDiscoverFirstPaint in main.jsx).
  const [featuredCatalog, setFeaturedCatalog] = useState<ContentItem[]>(
    () => readCachedDiscoverItems() ?? [],
  )
  useEffect(() => {
    let cancelled = false
    void fetchDiscoverCatalog().then((result) => {
      if (!cancelled && "items" in result) setFeaturedCatalog(result.items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Continue Reading: one data fetch, two placements in the tree below (mobileRow lands above
  // the filigree divider, which separates it from the composer form; desktopRow replaces the sample-excerpt fallback
  // below the composer) -- see useLandingContinueReading for why this is a hook and not a
  // component rendered directly where it's used.
  const { mobileRow, desktopRow } = useLandingContinueReading({
    user,
    onContinue: onContinueReading,
    onOpenLibraryBook: onContinueLibraryBook,
    // Signed out: no reading history to speak of yet, so a generic hardcoded sample
    // paragraph isn't really "yours". A bare "sign in" ask here converted on nothing to
    // look at, so this shows a few Discover picks instead (same card row/handler the
    // signed-in Continue Reading row uses) -- falls back further to the plain sign-in
    // invite only if the catalog hasn't loaded/is empty.
    fallback: !isGuest ? (
      <div className="sample-text w-full entry-4 order-3 md:order-3 mt-0 md:mt-1 hidden md:block">
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
    ) : featuredCatalog.length > 0 ? (
      <div className="continue-reading w-full entry-4 order-3 md:order-3 mt-0 md:mt-1 hidden md:block">
        <p className="sample-excerpt-label text-center">Featured reads</p>
        <div className="continue-reading__row">
          {featuredCatalog.slice(0, 4).map((item) => (
            <ContentCard
              key={`landing-featured-${item.id}`}
              content={item}
              onClick={() => onContinueReading(item)}
              eagerCover
            />
          ))}
        </div>
      </div>
    ) : (
      <div className="sample-text w-full entry-4 order-3 md:order-3 mt-0 md:mt-1 hidden md:block">
        <p className="sample-excerpt-label text-center">Welcome</p>
        <button type="button" onClick={() => openAuthModal()} className="sample-excerpt-btn text-left w-full group">
          <p className="sample-paragraph font-serif text-ui-base overflow-hidden">Sign in to save your place in every story and pick up right where you left off, on any device.</p>
          <span className="mt-3 block text-center">
            <span className="sample-link inline-flex items-center gap-2">
              Sign in
              <span className="sample-link-arrow inline-block transition-transform ease-in-out duration-200 group-hover:translate-x-[3px]" aria-hidden>→</span>
            </span>
          </span>
        </button>
      </div>
    ),
  })

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
        className="landing-page md:overflow-y-auto min-h-app max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden"
      >
      {/*
        Background art lives in its own wrapper (rather than directly on .landing-page)
        so its height comes from this wrapper's natural content size instead of
        .landing-page's own box. .landing-page is the scroll container here (md:overflow-y-auto),
        so its box height is capped to the visible viewport regardless of how tall the
        content actually is -- an img sized off *that* box (height: 100% of .landing-page)
        stops exactly at the fold and leaves the plain page background exposed once a
        reader scrolls past it. This wrapper isn't a scroll container, so it grows to the
        content's full height (matching .landing-page's scrollHeight), and the art's
        height: 100% now tracks that instead.

        Mobile is the opposite on purpose (max-md:h-full/min-h-0 below): there's no
        scrolling there (.landing-page is overflow-hidden, not a scroll container), so this
        wrapper needs to be capped to .landing-page's own (viewport-bounded, see the
        landingIndexElement <main> in App.tsx) box instead of growing with content --
        otherwise .landing-column's hero/composer flex-shrink never has a real ceiling to
        shrink against, and a tall Continue Reading row can push the composer off-screen
        with no way to reach it.
      */}
      <div
        className="landing-page-art-frame flex flex-col items-stretch md:items-center md:justify-start md:pt-16 md:pb-[clamp(2rem,7vh,5rem)] min-h-app max-md:h-full max-md:min-h-0 px-3 md:px-8"
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
        className="landing-column w-full max-w-[800px] flex flex-col flex-1 min-h-0 max-md:flex-1 max-md:min-h-0 max-md:overflow-hidden max-md:overflow-x-hidden md:flex-none md:justify-start md:my-auto gap-4 md:gap-5 max-md:pt-[max(7.5rem,calc(env(safe-area-inset-top,0px)+5.75rem))] md:pt-0"
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* Hero — mobile: fills space above composer; desktop: top. On mobile the art + greeting
            sit toward the bottom of that space (the art's max-md:mt-auto) rather than centered in
            it: centered split the slack evenly, leaving a wide dead gap between the greeting and
            the Continue Reading cards it introduces. mt-auto rather than justify-end because an
            auto margin collapses to 0 when the hero overflows on a short phone, where
            justify-end would push the top of the art out of reach of its own scroll. */}
        <div className="hero-mark hero-mark--literary text-center relative entry-1 order-1 flex flex-col flex-1 justify-center max-md:justify-start items-center min-h-0 max-md:overflow-y-auto md:flex-none md:overflow-visible md:block pt-2 md:pt-0 pb-[clamp(0.75rem,5dvh,2.5rem)] md:pb-6">
          <img
            src="/landing-hero-books.webp"
            alt=""
            width={480}
            height={511}
            // min-h-0 is load-bearing: as a flex item this img defaults to min-height:auto,
            // which for a replaced element resolves to its intrinsic height, so it refused to
            // shrink when the hero was squeezed (short viewport + a populated Continue Reading
            // row) and pushed the greeting out of the hero's box and into the filigree below.
            // It's decorative, so it's the part that should give way — the greeting never does.
            // `max-h-18` used to sit here and was never generated by Tailwind, so it capped
            // nothing — the height is driven by the width above (35vw at the book's aspect).
            // Dropped rather than made real: turning it on now would halve the illustration
            // at every size, which isn't what this change is for.
            className="landing-hero-art md:hidden mx-auto max-md:mt-auto mb-2 w-[min(35vw,15rem)] h-auto min-h-0 shrink object-contain object-center select-none pointer-events-none animate-levitate"
            aria-hidden
            loading="eager"
            fetchPriority="high"
          />
          <h1
            className="wordmark font-normal text-3xl sm:text-4xl md:text-5xl shrink-0"
            style={{ lineHeight: "1.15" }}
          >
            <span className="hero-greeting-gradient">
              <em>{heroGreeting}</em>
              {displayName ? (
                <>
                  {" "}
                  <em>{displayName}</em>
                </>
              ) : null}
            </span>
            ,{" "}
            <span className="wordmark-ink">{heroTailPhrase}</span>
          </h1>
        </div>

        {/* order-3 on mobile (md:order-2 on desktop) for this whole group relative to hero/
            continue-reading-desktop. Within the group on mobile: the Continue Reading row
            (order-1, see useLandingContinueReading's `mobileRow`), the filigree divider
            (order-2), then the composer (order-3). The divider sits *between* cards and
            composer so they read as two sections -- above the cards it split them from the
            greeting instead and left the cards looking like part of the composer. Desktop
            never renders the mobile row, and there the composer is md:order-1, so the
            divider's order-2 still lands it below the textarea, above the sample/row. */}
        <div className="order-3 md:order-2 flex flex-col gap-2 w-full shrink-0 md:mt-0 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] md:pb-0">
          <img
            src="/filigree-divider.svg"
            alt=""
            className="filigree-divider order-2 mx-auto shrink-0"
            aria-hidden
          />
          {mobileRow}
          <div className="entry-2 order-3 md:order-1 flex flex-col gap-2 w-full">
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
                <LandingQuickFillControls
                  onRandom={handleRandomPill}
                  onLearn={handleLearnPill}
                  randomPending={isRolling}
                  learnPending={isLearning}
                  disabled={isLoading}
                />
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
                  <button
                    ref={composerSubmitBtnRef}
                    type="submit"
                    disabled={!text.trim() || isLoading}
                    className={`submit-arrow-btn ${text.trim() ? "submit-arrow-btn--visible" : ""}`}
                    aria-label="Start reading"
                  >
                    <span className="submit-arrow-label" aria-hidden="true">
                      Translate
                    </span>
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

        {/* Continue Reading (desktop only) when there's history; otherwise the sample excerpt
            it normally replaces — useLandingContinueReading owns that fallback decision. */}
        {desktopRow}
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
