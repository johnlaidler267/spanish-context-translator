"use client"

import { Suspense, useState, useCallback, useEffect, useRef } from "react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { lazyRoute } from "@/lib/lazy-route"

// Route-level code splitting: these pages are visited far less often than the
// core reading flow, so keep them out of the main bundle. lazyRoute (not React.lazy
// directly) recovers from a stale chunk reference after a deploy — see its docstring.
const SettingsPage = lazyRoute(() => import("@/pages/settings"))
const DiscoverPage = lazyRoute(() => import("@/pages/discover"))
const LibraryPage = lazyRoute(() => import("@/pages/library"))
const UpgradePage = lazyRoute(() => import("@/pages/upgrade"))
const TermsPage = lazyRoute(() => import("@/pages/terms"))
const PrivacyPage = lazyRoute(() => import("@/pages/privacy"))
import { LandingShellLayout } from "@/components/landing/landing-shell-layout"
import { LandingScreen } from "@/components/landing/landing-screen"
import { LOADING_OVERLAY_PROGRESS_MS, LoadingOverlay } from "@/components/loading-overlay"
import { ReadingHeader } from "@/components/reading/reading-header"
import { ArticleContent } from "@/components/reading/article-content"
import { ReadMode } from "@/components/reading/read-mode"
import { SubscriptionLapsedModal } from "@/components/subscription/subscription-lapsed-modal"
import { useSubscription } from "@/contexts/subscription-context"
import {
  buildSentencePages,
  clampPageLimitsForLlmBatching,
  dedupeConsecutiveDuplicateLines,
  mergeArticlePagesIfWholeTextFitsLimits,
  mergeReconciledPagesToSentences,
  pageSourceText,
  READ_MODE_CHARS_PER_STEP_MOBILE,
  splitSourceIntoSentences,
  subdivideReadStepsForDesktop,
  subdivideReadStepsForMobile,
  translatePageText,
} from "@/lib/translate"
import { TranslationCache } from "@/lib/translation-cache"
import type { ViewMode } from "@/components/reading/mode-toggle"
import type { ReadingTheme } from "@/components/reading/theme-toggle"
import { getStoredLandingDraft, setStoredLandingDraft } from "@/lib/storage/landing-draft-storage"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/storage/theme-storage"
import { getReadingProgress, setReadingProgress } from "@/lib/storage/reading-progress-storage"
import {
  ensureCloudReadingProgressPulled,
  pushReadingProgress,
} from "@/lib/storage/reading-progress-sync"
import { getEffectiveDisplayName } from "@/lib/storage/display-name-storage"
import { Button } from "@/components/ui/button"
import { AppErrorModal } from "@/components/app-error-modal"
import { RateLimitModal } from "@/components/subscription/rate-limit-modal"
import { isRateLimitApiMessage } from "@/lib/api-errors"
import { useAuth } from "@/contexts/auth-context"
import { useArticlePageSplitLimits } from "@/hooks/use-article-page-split-limits"
import { GuestSignupModal } from "@/components/auth/guest-signup-modal"
import { hasReachedGuestLimit, incrementGuestUses } from "@/lib/subscription/guest-usage"
import { checkLimits } from "@/lib/subscription/enforce"
import {
  formatPlanLimitModal,
  broadcastUsageUpdated,
  fetchCurrentUsage,
  trackUsage,
  withCharsFairUseMirrors,
  type UsageCounters,
  type UsageLimits,
  UsageError,
} from "@/lib/subscription/usage"
import type { ContentItem } from "@/lib/discover/content-data"
import { fetchDiscoverCatalog } from "@/lib/discover/discover-catalog"
import { getUserEpubText, type LibraryEpub } from "@/lib/storage/epub-library"
import { supabase } from "@/lib/supabase"
import { getTier } from "@/lib/subscription/tiers"

type AppState = "landing" | "loading" | "reading"

// In dev, skip usage blocking unless VITE_ENFORCE_USAGE_IN_DEV=true (test modals / limits locally).
const IS_LOCAL_DEV = import.meta.env.DEV
const ENFORCE_USAGE_LIMITS =
  !IS_LOCAL_DEV || import.meta.env.VITE_ENFORCE_USAGE_IN_DEV === "true"
const USAGE_PREFLIGHT_TTL_MS = 60_000
const LANDING_MIN_LOADING_MS = LOADING_OVERLAY_PROGRESS_MS
/**
 * Desktop: small trim on DOM-measured page limits. Measurement already reserves footer height;
 * avoid stacking a large shrink here or article pages sit well under the viewport.
 */
const DESKTOP_ARTICLE_PAGE_LIMIT_SCALE = 0.95
/**
 * Discover catalog prefetch: how long a user must be sitting on the landing page before
 * warming the Discover cache in the background. Short enough that most people have it
 * ready by the time they navigate there; long enough to stay out of the way of the
 * landing page's own first paint / auth resolution.
 */
const DISCOVER_PREFETCH_DELAY_MS = 2000
/**
 * Article next-page prefetch: how long the user must sit on a page before the next one
 * starts translating in the background. Long enough that flipping through several pages
 * quickly doesn't fire a background call for every page skipped past; short enough that a
 * normal reading pace has the next page ready before Next is tapped.
 */
const ARTICLE_NEXT_PAGE_PREFETCH_DELAY_MS = 4000

type UsagePreflightSnapshot = {
  counters: UsageCounters
  limits: UsageLimits
  fetchedAt: number
}

function RouteLoadingFallback() {
  return (
    <main className="min-h-app bg-transparent flex items-center justify-center max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden">
      <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </main>
  )
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status: subscriptionStatus, isLapsed, popupDismissed, dismissPopup, isLoading: subscriptionLoading } = useSubscription()
  const { user, isLoading: authLoading, isSigningIn } = useAuth()

  const [appState, setAppState] = useState<AppState>("landing")

  /** In-memory + sessionStorage: survives reading → home and page refresh (same tab). */
  const [landingDraft, setLandingDraft] = useState(() => getStoredLandingDraft())

  useEffect(() => {
    if (typeof landingDraft !== "string") { setLandingDraft(""); return }
    setStoredLandingDraft(landingDraft)
  }, [landingDraft])
  const [viewMode, setViewMode] = useState<ViewMode>("article")
  const [hoverTtsEnabled, setHoverTtsEnabled] = useState(false)
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  const [displayName, setDisplayName] = useState(() =>
    getEffectiveDisplayName(null),
  )
  const appTheme = readingTheme

  useEffect(() => {
    document.documentElement.classList.toggle("dark", appTheme === "dark")
    setStoredReadingTheme(appTheme)
  }, [appTheme])

  useEffect(() => {
    setDisplayName(getEffectiveDisplayName(user))
  }, [user, location.pathname])

  // If the user navigates away from "/" while in a reading session, exit reading mode.
  // Otherwise the router is intentionally restricted and it feels like navigation is broken.
  useEffect(() => {
    if (appState === "reading" && location.pathname !== "/") {
      setAppState("landing")
    }
  }, [appState, location.pathname])

  /**
   * Set together with `pendingReadingTransitionRef` below: when a translation started from a
   * non-"/" screen (e.g. Discover) finishes, we navigate home and flip into "reading" -- but
   * `navigate()`'s location update and a same-tick `setAppState("reading")` don't reliably land
   * in the same React commit (the router's own state lives in an ancestor component). If
   * "reading" commits first, the guard effect above sees "reading" alongside the still-stale
   * (non-"/") pathname and immediately reverts it. Deferring the appState flip to this effect --
   * which only runs once `location.pathname` has actually become "/" -- sidesteps that race
   * instead of depending on commit ordering.
   */
  const pendingReadingTransitionRef = useRef(false)
  useEffect(() => {
    if (pendingReadingTransitionRef.current && location.pathname === "/") {
      pendingReadingTransitionRef.current = false
      setAppState("reading")
    }
  }, [location.pathname])

  /** Hide shell top-left letter art (main.jsx) during article / read — not on landing */
  useEffect(() => {
    document.documentElement.classList.toggle("lector-reading-session", appState === "reading")
    return () => document.documentElement.classList.remove("lector-reading-session")
  }, [appState])

  const cacheRef = useRef(new TranslationCache())
  /**
   * LLM batching only: same sentence-boundary pages for Article and Read mode
   * (LLM page size from DOM-measured article column; see useArticlePageSplitLimits.)
   * Read mode shows subdivided steps for the current article page only; no extra LLM preload.
   */
  const [sourcePages, setSourcePages] = useState<string[][]>([])
  const [articlePageIndex, setArticlePageIndex] = useState(0)
  /**
   * Discover catalog id for the piece currently being read, or null for a plain landing-page
   * submission (which has no saved-progress identity). Set on a Discover "start/continue
   * reading" and cleared on `handleBack` — drives both resuming at a saved page and persisting
   * the page position as the reader moves through it (see the effect below).
   */
  const [activeReadingContentId, setActiveReadingContentId] = useState<string | null>(null)
  const [readingSessionId, setReadingSessionId] = useState(0)
  /** Increment when Read mode goes to previous article page from first step (land on last read step). */
  const [readEnterLastStepNonce, setReadEnterLastStepNonce] = useState(0)
  /** Last `readEnterLastStepNonce` applied by ReadMode (avoids remount / Strict Mode re-applying). */
  const [readLastConsumedEnterNonce, setReadLastConsumedEnterNonce] = useState(0)
  const [renderTick, setRenderTick] = useState(0)
  const bump = useCallback(() => setRenderTick((t) => t + 1), [])
  const consumeReadEnterLastStep = useCallback((n: number) => {
    setReadLastConsumedEnterNonce(n)
  }, [])
  const [error, setError] = useState("")
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)
  const [planLimitModal, setPlanLimitModal] = useState<{
    title: string
    message: string
  } | null>(null)
  /** After closing the rate-limit modal, don’t reopen until retry/new submit or the error clears. */
  const rateLimitModalSuppressedRef = useRef(false)
  /** Narrow viewport: shorter read-mode steps (LLM page size unchanged). */
  const [readLayoutMobile, setReadLayoutMobile] = useState(false)
  const articlePageSplitLimits = useArticlePageSplitLimits()
  const [guestSignupOpen, setGuestSignupOpen] = useState(false)
  const usagePreflightRef = useRef<UsagePreflightSnapshot | null>(null)
  const usagePreflightInFlightRef = useRef<Promise<void> | null>(null)
  /** Guards the Discover prefetch below from refiring every time the landing page mounts. */
  const discoverPrefetchedRef = useRef(false)

  useEffect(() => {
    if (user) setGuestSignupOpen(false)
  }, [user])

  useEffect(() => {
    usagePreflightRef.current = null
    usagePreflightInFlightRef.current = null
  }, [user?.id])

  const refreshUsagePreflight = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!user || !ENFORCE_USAGE_LIMITS) return
      const snap = usagePreflightRef.current
      const isFresh =
        snap != null && Date.now() - snap.fetchedAt < USAGE_PREFLIGHT_TTL_MS
      if (!force && isFresh) return

      const inFlight = usagePreflightInFlightRef.current
      if (inFlight) return inFlight

      const run = (async () => {
        try {
          const preflight = await fetchCurrentUsage()
          usagePreflightRef.current = {
            counters: preflight.counters,
            limits: preflight.limits,
            fetchedAt: Date.now(),
          }
        } finally {
          usagePreflightInFlightRef.current = null
        }
      })()
      usagePreflightInFlightRef.current = run
      return run
    },
    [user],
  )

  useEffect(() => {
    if (!user || !ENFORCE_USAGE_LIMITS) return
    if (appState !== "landing" && appState !== "loading") return
    void refreshUsagePreflight()
    const onFocus = () => {
      void refreshUsagePreflight({ force: true })
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [user, appState, refreshUsagePreflight])

  /**
   * Discover catalog prefetch: while the user is sitting on the landing page (logged in
   * or not -- the catalog isn't user-specific), warm it in the background so /discover
   * paints instantly instead of showing its loading skeleton. Calls the exact same
   * `fetchDiscoverCatalog()` DiscoverPage's own mount effect calls (same localStorage
   * cache, same in-flight-request dedup), so this just kicks that fetch off earlier --
   * it isn't a second, parallel cache. Gated on `!authLoading` so it doesn't compete with
   * auth resolving, and on a ref (not just "once per mount") so revisiting the landing
   * page later in the same session -- after this already fired once -- doesn't refire it;
   * if the user leaves before the delay elapses, the ref is never set and the next landing
   * visit tries again.
   */
  useEffect(() => {
    if (authLoading) return
    if (appState !== "landing") return
    if (location.pathname !== "/") return
    if (discoverPrefetchedRef.current) return
    const timer = window.setTimeout(() => {
      discoverPrefetchedRef.current = true
      void fetchDiscoverCatalog()
    }, DISCOVER_PREFETCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [authLoading, appState, location.pathname])

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setReadLayoutMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const dismissLapsedModalAndGoHome = useCallback(() => {
    dismissPopup()
    navigate("/", { replace: true })
  }, [dismissPopup, navigate])

  const handleTextSubmit = useCallback(
    // `populateLandingDraft` defaults to true for the landing page's own composer, whose
    // submitted text belongs back in its own textbox on return. Discover's "Start reading"
    // passes false: it reuses this same submit pipeline (usage checks, paging, translation)
    // but its content is a separate catalog item, not landing-page draft text -- without this
    // flag it was overwriting the landing textbox with whatever Discover article was opened.
    // `contentId` is the Discover catalog id (omitted for a plain landing submission) -- when
    // present, it both resumes at the saved page (if any) and turns on progress-saving as the
    // reader moves through the piece; see `activeReadingContentId`.
    async (
      text: string,
      { populateLandingDraft = true, contentId = null }: { populateLandingDraft?: boolean; contentId?: string | null } = {},
    ) => {
      if (!text.trim()) return

      // Guests: no track-usage — cap anonymous previews in localStorage (guest_tries_used).
      // NOTE: `!user` is only ever true for the very first submit — a successful translate
      // creates a Supabase anonymous session as a side effect (ensureSessionForGroq in
      // lib/groq-edge.ts), so `user` is set by the time a second submit happens and this
      // local check never runs again. All real limiting after that point is server-side
      // (see lib/subscription/enforce.ts + usage.ts). See guest-usage.ts for more detail.
      if (!user && hasReachedGuestLimit()) {
        setGuestSignupOpen(true)
        return
      }
      const trimmed = dedupeConsecutiveDuplicateLines(text).trim()
      if (populateLandingDraft) setLandingDraft(trimmed)

      // Free plan: block before anything gets tracked. Without this check, an over-limit
      // paste still consumed a submission -- trackUsage below fires unconditionally, and
      // enforcement only happened later on the actual translate call -- so a submission
      // that could never succeed still cost you one. Mirrors handleDiscoverStartReading.
      const freeCharLimit = getTier("free").limits.charsPerSubmission
      const isEffectivelyFreeUser =
        user != null &&
        (subscriptionStatus == null || subscriptionStatus === "free" || isLapsed)
      if (isEffectivelyFreeUser && freeCharLimit !== null && trimmed.length > freeCharLimit) {
        setPlanLimitModal({
          title: "Submission exceeds free plan allowance",
          message:
            `This text is ${trimmed.length.toLocaleString()} characters long, which is over the free plan limit of ` +
            `${freeCharLimit.toLocaleString()} characters per submission. Upgrade to continue.`,
        })
        return
      }

      setError("")
      rateLimitModalSuppressedRef.current = false
      setRateLimitMessage(null)
      setPlanLimitModal(null)
      setAppState("loading")
      const submitStartedAtMs = Date.now()

      try {
        let sents = splitSourceIntoSentences(trimmed)
        if (sents.length === 0) sents = [trimmed]
        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 767px)").matches
        const basePageLimits = clampPageLimitsForLlmBatching(articlePageSplitLimits)
        const effectivePageLimits = isMobile
          ? basePageLimits
          : {
              maxWords: Math.max(
                80,
                Math.floor(basePageLimits.maxWords * DESKTOP_ARTICLE_PAGE_LIMIT_SCALE),
              ),
              maxChars: Math.max(
                400,
                Math.floor(basePageLimits.maxChars * DESKTOP_ARTICLE_PAGE_LIMIT_SCALE),
              ),
            }
        let pages = buildSentencePages(sents, effectivePageLimits)
        if (pages.length === 0) pages = [[trimmed]]
        pages = mergeArticlePagesIfWholeTextFitsLimits(
          pages,
          effectivePageLimits,
          trimmed,
          isMobile,
        )

        if (user) {
          try {
            if (ENFORCE_USAGE_LIMITS) {
              try {
                let preflight = usagePreflightRef.current
                if (preflight == null) {
                  await refreshUsagePreflight({ force: true })
                  preflight = usagePreflightRef.current
                } else if (Date.now() - preflight.fetchedAt >= USAGE_PREFLIGHT_TTL_MS) {
                  void refreshUsagePreflight({ force: true })
                }
                if (preflight == null) {
                  throw new UsageError("Could not verify usage. Check your connection and try again.")
                }
                // Mirror server: each text submit bumps monthly texts and the daily counter.
                // checkLimits only inspects keys present in the increments object — include daily explicitly.
                const guard = checkLimits(
                  preflight.counters,
                  preflight.limits,
                  withCharsFairUseMirrors({
                    texts_submitted: 1,
                    texts_submitted_today: 1,
                    pages_processed: pages.length,
                    chars_processed: trimmed.length,
                  }),
                )
                if (!guard.allowed) {
                  setPlanLimitModal(
                    formatPlanLimitModal(guard.blocked.map((s) => s.metric)),
                  )
                  setAppState("landing")
                  return
                }
              } catch (preflightErr) {
                setError(
                  preflightErr instanceof UsageError
                    ? preflightErr.message
                    : "Could not verify usage. Check your connection and try again.",
                )
                setAppState("landing")
                return
              }
            }

            const usageIncrements = {
              texts_submitted: 1,
              chars_processed: trimmed.length,
              pages_processed: pages.length,
            }
            void trackUsage(usageIncrements)
              .then((usage) => {
                usagePreflightRef.current = {
                  counters: usage.counters,
                  limits: usage.limits,
                  fetchedAt: Date.now(),
                }
                if (!usage.allowed && ENFORCE_USAGE_LIMITS) {
                  setPlanLimitModal(formatPlanLimitModal(usage.exceeded))
                  setAppState("landing")
                  return
                }
                broadcastUsageUpdated()
              })
              .catch((e) => {
                console.warn("[usage] background trackUsage failed:", e)
              })
          } catch (e) {
            setError(
              e instanceof UsageError
                ? e.message
                : "Could not verify usage. Check your connection and try again.",
            )
            setAppState("landing")
            return
          }
        }

        // Resume at the saved page for this Discover item, if any — clamped in case the source
        // (or the page-split limits, which vary by viewport) produced a different page count
        // than when the position was saved. Opens the pager already on that page rather than
        // literally starting the reader there: earlier pages are still reachable by paging back
        // (see the on-demand load added to goArticlePrev/goReadPrevArticlePage below), they're
        // just not pre-translated up front.
        //
        // Pull any progress synced from another device first (no-op after the first successful
        // call this session/user — see ensureCloudReadingProgressPulled) so a book resumed here
        // reflects where the reader actually left off, not just what this browser remembers.
        if (contentId) await ensureCloudReadingProgressPulled(user)
        const savedPageIndex = contentId ? getReadingProgress(user, contentId) : null
        const initialPageIndex =
          savedPageIndex != null ? Math.min(Math.max(savedPageIndex, 0), pages.length - 1) : 0

        cacheRef.current = new TranslationCache()
        setSourcePages(pages)
        setArticlePageIndex(initialPageIndex)
        setActiveReadingContentId(contentId ?? null)
        setReadingSessionId((k) => k + 1)
        setReadEnterLastStepNonce(0)
        setReadLastConsumedEnterNonce(0)

        void cacheRef.current
          .loadPage(initialPageIndex, pageSourceText(pages[initialPageIndex]!), translatePageText)
          .then(() => {
            bump()
            // Guests: count only after success; limit is enforced before submit (modal blocks new articles).
            if (!user) incrementGuestUses()
          })
          .catch(() => {
            // Error details are stored in TranslationCache and surfaced by existing modal logic.
            bump()
          })
        const remainingLoadingMs = Math.max(0, LANDING_MIN_LOADING_MS - (Date.now() - submitStartedAtMs))
        if (remainingLoadingMs > 0) {
          await new Promise((r) => setTimeout(r, remainingLoadingMs))
        }
        // The reading UI only mounts on the index route (see `appState === "reading"` below).
        // Navigate here -- once translation is actually done -- rather than up front: doing it
        // up front (as this used to) switched screens the instant "Start Reading" was clicked,
        // so the loading overlay that follows sat on top of the landing page instead of
        // whatever screen (e.g. Discover) the translation was actually started from.
        if (location.pathname === "/") {
          // Landing's own composer submit -- already home, flip straight into reading.
          setAppState("reading")
        } else {
          // Discover (or any other screen): navigate home and let the
          // pendingReadingTransitionRef effect above flip appState once the route has actually
          // caught up, instead of racing it here.
          pendingReadingTransitionRef.current = true
          navigate("/")
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong."
        if (isRateLimitApiMessage(msg)) {
          setRateLimitMessage(msg)
        } else {
          setError(msg)
        }
        setAppState("landing")
      }
    },
    [
      user,
      bump,
      articlePageSplitLimits,
      refreshUsagePreflight,
      subscriptionStatus,
      isLapsed,
      navigate,
      location.pathname,
    ],
  )

  const handleDiscoverStartReading = useCallback(
    async (content: ContentItem) => {
      const { data, error } = await supabase
        .from("discover_items")
        .select("body_text")
        .eq("id", content.id)
        .maybeSingle()
      const body = data?.body_text?.trim() ?? ""
      const sourceText = !error && body.length > 0 ? body : content.preview.trim()
      if (!sourceText) return

      const freeCharLimit = getTier("free").limits.charsPerSubmission
      const isEffectivelyFreeUser =
        user != null &&
        (subscriptionStatus == null || subscriptionStatus === "free" || isLapsed)
      if (
        isEffectivelyFreeUser &&
        freeCharLimit !== null &&
        sourceText.length > freeCharLimit
      ) {
        const blockedMessage =
          `This reading is ${sourceText.length.toLocaleString()} characters long, which is over the free plan limit of ` +
          `${freeCharLimit.toLocaleString()} characters per submission. Upgrade to continue.`
        // Shown inline by ContentPreviewModal (which is already open here) rather than via the
        // global RateLimitModal — stacking that on top of the open Discover dialog left it
        // visually on top but functionally dead, since Radix's modal Dialog disables pointer
        // events on everything outside its own content while open.
        return { blockedMessage }
      }

      // Stay on Discover while the loading overlay runs (it's a fixed, global overlay -- it
      // renders fine on top of whatever screen is current) so the overlay's blurred backdrop
      // shows Discover, not the landing page. handleTextSubmit navigates home itself once the
      // translation is ready, right before switching into the reading UI.
      await handleTextSubmit(sourceText, { populateLandingDraft: false, contentId: content.id })
    },
    [handleTextSubmit, subscriptionStatus, isLapsed, user],
  )

  const handleLibraryStartReading = useCallback(
    async (book: LibraryEpub) => {
      // Fetch a fresh user rather than trusting the `user` this callback closed over: this can
      // fire moments after a first-ever upload created a brand-new anonymous session (see
      // library page's handleFileSelected), before the auth context's own state has caught up.
      const {
        data: { user: freshUser },
      } = await supabase.auth.getUser()
      const saved = await getUserEpubText(freshUser, book.id)
      const sourceText = saved?.text.trim() ?? ""
      if (!sourceText) {
        setError("Couldn't load this book. It may have been removed.")
        return
      }
      // No separate over-the-limit preview/confirm step here (unlike Discover, which shows one
      // inside its already-open ContentPreviewModal) -- handleTextSubmit already blocks and
      // shows the plan-limit modal itself for a free-tier user opening an oversized book, same
      // as pasting the same text directly would.
      await handleTextSubmit(sourceText, { populateLandingDraft: false, contentId: book.id })
    },
    [handleTextSubmit],
  )

  const handleBack = useCallback(() => {
    setAppState("landing")
    setSourcePages([])
    cacheRef.current = new TranslationCache()
    setArticlePageIndex(0)
    setActiveReadingContentId(null)
    setError("")
    setRateLimitMessage(null)
    setPlanLimitModal(null)
    rateLimitModalSuppressedRef.current = false
    setViewMode("article")
    bump()
  }, [bump])

  const totalPages = sourcePages.length

  /**
   * Persist "which page was I on" for Discover content as the reader moves through it, so
   * reopening the same item later (see the resume logic in `handleTextSubmit`) picks up where
   * they left off. Only runs for a Discover-originated session (`activeReadingContentId` set) —
   * a plain landing-page paste has no catalog id to key progress by.
   */
  useEffect(() => {
    if (appState !== "reading" || !activeReadingContentId) return
    setReadingProgress(user, activeReadingContentId, articlePageIndex, totalPages)
    // Cross-device sync (debounced) on top of the localStorage write above -- see
    // reading-progress-sync.ts. No-ops for a null user.
    pushReadingProgress(user, activeReadingContentId, articlePageIndex, totalPages)
  }, [appState, activeReadingContentId, articlePageIndex, totalPages, user])

  /**
   * Article next-page prefetch: a few seconds after the current page becomes visible, start
   * translating the next one in the background so it's already in TranslationCache by the
   * time the user taps Next — no spinner wait. Reuses the exact same
   * `TranslationCache.loadPage` call goArticleNext makes on demand, so caching/dedup/retry
   * behavior is identical either way; this just kicks it off earlier. The delay is what keeps
   * someone flipping through several pages fast from firing a background call for every page
   * they pass through — the effect (and its pending timer) is torn down and rescheduled every
   * time `articlePageIndex` changes, so only a page the user actually lingers on gets prefetched.
   */
  useEffect(() => {
    if (appState !== "reading" || totalPages === 0) return
    const cache = cacheRef.current
    const nextIdx = articlePageIndex + 1
    if (nextIdx >= totalPages) return
    // Already cached, already errored, or already loading (e.g. a prior prefetch, or the
    // user already hit Next) — nothing to schedule.
    if (cache.getPage(nextIdx) != null) return
    if (cache.getError(nextIdx) != null) return
    if (cache.isLoading(nextIdx)) return

    const timer = window.setTimeout(() => {
      void cache
        .loadPage(nextIdx, pageSourceText(sourcePages[nextIdx]!), translatePageText)
        .then(bump)
        .catch(bump)
    }, ARTICLE_NEXT_PAGE_PREFETCH_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [appState, articlePageIndex, totalPages, sourcePages, bump])

  const retryArticlePage = useCallback(() => {
    if (totalPages === 0) return
    rateLimitModalSuppressedRef.current = false
    const i = articlePageIndex
    cacheRef.current.clearPage(i)
    bump()
    void cacheRef.current
      .loadPage(i, pageSourceText(sourcePages[i]!), translatePageText)
      .then(bump)
      .catch(bump)
  }, [articlePageIndex, sourcePages, totalPages, bump])

  useEffect(() => {
    const messages: string[] = []
    if (error) messages.push(error)
    /* Failed submit leaves landing + sourcePages + cache errors; reading uses same cache */
    if (totalPages > 0) {
      for (let i = 0; i < totalPages; i++) {
        const m = cacheRef.current.getError(i)
        if (m) messages.push(m)
      }
    }
    const stillHasRateLimit = messages.some(isRateLimitApiMessage)
    if (!stillHasRateLimit) {
      rateLimitModalSuppressedRef.current = false
      setRateLimitMessage(null)
      return
    }
    if (rateLimitModalSuppressedRef.current) return
    const rateMsg = messages.find(isRateLimitApiMessage)
    if (rateMsg) setRateLimitMessage(rateMsg)
  }, [error, appState, totalPages, renderTick, articlePageIndex])

  const dismissRateLimitModal = useCallback(() => {
    setRateLimitMessage(null)
    rateLimitModalSuppressedRef.current = true
  }, [])

  const dismissPlanLimitModal = useCallback(() => {
    setPlanLimitModal(null)
  }, [])

  /** Dev: dismiss rate-limit modal, clear throttled page errors, and retry loads. */
  const devBypassRateLimit = useCallback(() => {
    setRateLimitMessage(null)
    rateLimitModalSuppressedRef.current = true
    setError("")
    const c = cacheRef.current
    const pages = sourcePages
    if (pages.length > 0) {
      for (let i = 0; i < pages.length; i++) {
        const e = c.getError(i)
        if (e && isRateLimitApiMessage(e)) {
          c.clearPage(i)
          void c
            .loadPage(i, pageSourceText(pages[i]!), translatePageText)
            .then(bump)
            .catch(bump)
        }
      }
    }
    bump()
  }, [sourcePages, bump])

  const viewportMain =
    "min-h-app flex flex-col max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden overflow-hidden"

  if ((authLoading || subscriptionLoading) && location.pathname !== "/discover") {
    return (
      <main className="min-h-app bg-transparent flex items-center justify-center max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden">
        <div className="flex flex-col items-center gap-3 w-40">
          {isSigningIn && (
            <p className="text-muted-foreground font-sans text-xs tracking-wide">Logging in…</p>
          )}
          <div className="w-full h-[2px] rounded-full bg-border overflow-hidden">
            <div className="auth-loading-bar-fill h-full w-1/3 rounded-full bg-primary" />
          </div>
        </div>
      </main>
    )
  }

  const landingIndexElement = (
    <main className={`min-h-app bg-transparent ${viewportMain}`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <LandingScreen
          draftText={typeof landingDraft === "string" ? landingDraft : ""}
          onDraftChange={setLandingDraft}
          onSubmit={handleTextSubmit}
          isLoading={appState === "loading"}
          theme={appTheme}
          displayName={displayName}
          onContinueReading={handleDiscoverStartReading}
        />
      </div>
    </main>
  )

  let readingHome: React.ReactNode = null
  if (appState === "reading") {
    const cache = cacheRef.current
    const articleItems = cache.getPage(articlePageIndex)
    const readSentencesMerged = mergeReconciledPagesToSentences(
      articleItems ? [articleItems] : [],
    )
    const readSentences = readLayoutMobile
      ? subdivideReadStepsForMobile(readSentencesMerged, READ_MODE_CHARS_PER_STEP_MOBILE)
      : subdivideReadStepsForDesktop(readSentencesMerged)

    let readStepOffset = 0
    for (let p = 0; p < articlePageIndex; p++) {
      const priorItems = cache.getPage(p)
      if (priorItems == null) continue
      const priorMerged = mergeReconciledPagesToSentences([priorItems])
      const priorSteps = readLayoutMobile
        ? subdivideReadStepsForMobile(priorMerged, READ_MODE_CHARS_PER_STEP_MOBILE)
        : subdivideReadStepsForDesktop(priorMerged)
      readStepOffset += priorSteps.length
    }
    const articleErrRaw = cache.getError(articlePageIndex)
    const articleErr =
      articleErrRaw && !isRateLimitApiMessage(articleErrRaw) ? articleErrRaw : null
    const articleLoading =
      cache.isLoading(articlePageIndex) && articleItems == null && articleErrRaw == null

    const nextIdx = articlePageIndex + 1
    const nextPageOpen = articlePageIndex < totalPages - 1 && !articleLoading
    const nextPageLoading =
      articlePageIndex < totalPages - 1 &&
      cache.isLoading(nextIdx) &&
      cache.getPage(nextIdx) == null &&
      cache.getError(nextIdx) == null

    // Backing up onto a page that was never visited this session (e.g. resuming mid-document —
    // see the initial-page-index logic in handleTextSubmit — jumps straight to the saved page,
    // so nothing before it has been translated yet) needs the same on-demand load-then-advance
    // treatment as going forward, not just a bare index decrement.
    const prevIdx = articlePageIndex - 1
    const prevPageLoading =
      articlePageIndex > 0 &&
      cache.isLoading(prevIdx) &&
      cache.getPage(prevIdx) == null &&
      cache.getError(prevIdx) == null

    const goArticlePrev = () => {
      if (articlePageIndex <= 0) return
      if (cache.getPage(prevIdx) != null || cache.getError(prevIdx) != null) {
        setArticlePageIndex((p) => p - 1)
        return
      }
      bump()
      void cache
        .loadPage(prevIdx, pageSourceText(sourcePages[prevIdx]!), translatePageText)
        .then(() => {
          setArticlePageIndex((p) => p - 1)
          bump()
        })
        .catch(bump)
    }

    const goArticleNext = () => {
      if (articlePageIndex >= totalPages - 1 || articleLoading) return
      const idx = articlePageIndex + 1
      if (cache.getPage(idx) != null || cache.getError(idx) != null) {
        setArticlePageIndex((p) => p + 1)
        return
      }
      // Not cached yet — may already be an in-flight prefetch. loadPage dedupes by index
      // (returns the same promise rather than firing a second call), so this is exactly the
      // on-demand path whether or not a background prefetch already kicked it off: stay on
      // this page (Next button shows its own loading spinner via nextPageLoading) and advance
      // once the shared promise settles.
      bump()
      void cache
        .loadPage(idx, pageSourceText(sourcePages[idx]!), translatePageText)
        .then(() => {
          setArticlePageIndex((p) => p + 1)
          bump()
        })
        .catch(bump)
    }

    const goReadPrevArticlePage = () => {
      if (articlePageIndex <= 0) return
      if (cache.getPage(prevIdx) != null || cache.getError(prevIdx) != null) {
        setReadEnterLastStepNonce((n) => n + 1)
        setArticlePageIndex((p) => p - 1)
        return
      }
      bump()
      void cache
        .loadPage(prevIdx, pageSourceText(sourcePages[prevIdx]!), translatePageText)
        .then(() => {
          setReadEnterLastStepNonce((n) => n + 1)
          setArticlePageIndex((p) => p - 1)
          bump()
        })
        .catch(bump)
    }

    const readNextPageErrorRaw =
      articlePageIndex < totalPages - 1 ? cache.getError(nextIdx) : undefined
    const readNextPageError =
      readNextPageErrorRaw && !isRateLimitApiMessage(readNextPageErrorRaw)
        ? readNextPageErrorRaw
        : null

    const retryReadNextPage = () => {
      if (nextIdx >= totalPages) return
      rateLimitModalSuppressedRef.current = false
      cache.clearPage(nextIdx)
      void cache
        .loadPage(nextIdx, pageSourceText(sourcePages[nextIdx]!), translatePageText)
        .then(bump)
        .catch(bump)
    }

    const hasSentences = readSentences.length > 0

    readingHome = (
      <main
        className={`min-h-app bg-background ${viewportMain}`}
        style={{ maxHeight: "100dvh" }}
      >
        <div className="shrink-0">
          <ReadingHeader
            mode={viewMode}
            onModeChange={setViewMode}
            onBack={handleBack}
            theme={readingTheme}
            onThemeChange={setReadingTheme}
            hoverTtsEnabled={hoverTtsEnabled}
            onHoverTtsChange={setHoverTtsEnabled}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden animate-fade-in-up max-md:overflow-hidden md:overflow-y-auto">
          {viewMode === "article" && totalPages > 0 ? (
            <div className="flex w-full min-h-0 flex-1 flex-col">
              <ArticleContent
                items={articleItems}
                loading={articleLoading}
                errorMessage={articleErr ?? null}
                onRetry={articleErr ? retryArticlePage : undefined}
                pageKey={articlePageIndex}
                hoverTtsEnabled={hoverTtsEnabled}
                pagination={
                  totalPages > 1
                    ? {
                        pageIndex: articlePageIndex,
                        pageCount: totalPages,
                        onPrevious: goArticlePrev,
                        onNext: goArticleNext,
                        nextPageLoading,
                        nextPageOpen,
                        prevPageLoading,
                      }
                    : null
                }
              />
            </div>
          ) : hasSentences ? (
            <div className="flex w-full min-h-0 flex-1 flex-col">
              <ReadMode
                readingSessionKey={readingSessionId}
                readPageKey={articlePageIndex}
                readStepOffset={readStepOffset}
                enterAtLastStepNonce={readEnterLastStepNonce}
                lastConsumedEnterNonce={readLastConsumedEnterNonce}
                onConsumeEnterLastStep={consumeReadEnterLastStep}
                sentences={readSentences}
                articlePageIndex={articlePageIndex}
                totalPages={totalPages}
                onRequestNextArticlePage={goArticleNext}
                onRequestPrevArticlePage={goReadPrevArticlePage}
                nextPageLoading={nextPageLoading}
                nextPageOpen={nextPageOpen}
                nextPageError={readNextPageError}
                onRetryNextPage={readNextPageError ? retryReadNextPage : undefined}
                prevPageLoading={prevPageLoading}
                hoverTtsEnabled={hoverTtsEnabled}
              />
            </div>
          ) : totalPages > 0 ? (
            <div className="flex w-full min-h-0 flex-1 flex-col">
              <ArticleContent
                items={articleItems}
                loading={articleLoading}
                errorMessage={articleErr ?? null}
                onRetry={articleErr ? retryArticlePage : undefined}
                pageKey={articlePageIndex}
                hoverTtsEnabled={hoverTtsEnabled}
                pagination={null}
              />
            </div>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <>
      {appState === "loading" && <LoadingOverlay />}
      {error && (
        // Global (not scoped to the landing route): a translation can now fail while
        // initiated from a non-landing screen (e.g. Discover) without having navigated away,
        // so this needs to surface no matter which screen is current.
        <AppErrorModal message={error} onDismiss={() => setError("")} />
      )}
      {!IS_LOCAL_DEV && isLapsed && !popupDismissed && (
        <SubscriptionLapsedModal
          onDismiss={dismissLapsedModalAndGoHome}
          onDismissForUpgrade={dismissPopup}
        />
      )}
      <GuestSignupModal open={guestSignupOpen} onClose={() => setGuestSignupOpen(false)} />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            element={
              <LandingShellLayout
                theme={appTheme}
                onThemeChange={setReadingTheme}
                displayName={displayName}
                sidebarDisabled={appState === "loading"}
                readingActive={appState === "reading"}
                onExitReading={handleBack}
              />
            }
          >
            <Route index element={appState === "reading" ? readingHome : landingIndexElement} />
            <Route
              path="discover"
              element={<DiscoverPage onStartReading={handleDiscoverStartReading} />}
            />
            <Route
              path="library"
              element={<LibraryPage onStartReading={(book) => void handleLibraryStartReading(book)} />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {(rateLimitMessage || planLimitModal) && (
        <RateLimitModal
          message={rateLimitMessage ?? planLimitModal!.message}
          onDismiss={
            rateLimitMessage
              ? dismissRateLimitModal
              : dismissPlanLimitModal
          }
          title={
            planLimitModal && !rateLimitMessage
              ? planLimitModal.title
              : undefined
          }
          showProviderHint={!planLimitModal || !!rateLimitMessage}
          extraFooter={
            planLimitModal && !rateLimitMessage && (
              <p className="mt-4 text-sm text-muted-foreground">
                <Link
                  to="/upgrade"
                  onClick={dismissPlanLimitModal}
                  className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
                >
                  View upgrade options
                </Link>
                <span className="mx-1.5 text-border">·</span>
                <Link
                  to="/settings?tab=billing"
                  onClick={dismissPlanLimitModal}
                  className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
                >
                  Billing & usage
                </Link>
              </p>
            )
          }
          devBypass={
            IS_LOCAL_DEV && rateLimitMessage
              ? devBypassRateLimit
              : undefined
          }
        />
      )}
    </>
  )
}
