"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import SettingsPage from "@/pages/settings"
import DiscoverPage from "@/pages/discover"
import MyLibraryPage from "@/pages/my-library"
import { LandingShellLayout } from "./components/landing-shell-layout"
import { LandingScreen } from "./components/landing-screen"
import { LOADING_OVERLAY_PROGRESS_MS, LoadingOverlay } from "./components/loading-overlay"
import { ReadingHeader } from "./components/reading-header"
import { ArticleContent } from "./components/article-content"
import { ReadMode } from "./components/read-mode"
import { SubscriptionLapsedModal } from "./components/subscription-lapsed-modal"
import { useSubscription } from "./contexts/subscription-context"
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
} from "./lib/translate"
import { TranslationCache } from "./lib/translation-cache"
import type { ViewMode } from "./components/mode-toggle"
import type { ReadingTheme } from "./components/theme-toggle"
import { getStoredLandingDraft, setStoredLandingDraft } from "./lib/landing-draft-storage"
import { getStoredReadingTheme, setStoredReadingTheme } from "./lib/theme-storage"
import { getEffectiveDisplayName } from "./lib/display-name-storage"
import { Button } from "./components/ui/button"
import { AppErrorModal } from "./components/app-error-modal"
import { RateLimitModal } from "./components/rate-limit-modal"
import { isRateLimitApiMessage } from "./lib/api-errors"
import { useAuth } from "./contexts/auth-context"
import { useArticlePageSplitLimits } from "./hooks/use-article-page-split-limits"
import { GuestSignupModal } from "./components/guest-signup-modal"
import { hasReachedGuestLimit, incrementGuestUses } from "./lib/guest-usage"
import { checkLimits } from "./lib/enforce"
import {
  formatPlanLimitModal,
  broadcastUsageUpdated,
  fetchCurrentUsage,
  trackUsage,
  withCharsFairUseMirrors,
  type UsageCounters,
  type UsageLimits,
  UsageError,
} from "./lib/usage"
import type { ContentItem } from "./lib/content-data"
import { supabase } from "./lib/supabase"

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

type UsagePreflightSnapshot = {
  counters: UsageCounters
  limits: UsageLimits
  fetchedAt: number
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isLapsed, popupDismissed, dismissPopup, isLoading: subscriptionLoading } = useSubscription()
  const { user, isLoading: authLoading } = useAuth()

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
    async (text: string) => {
      if (!text.trim()) return

      // Guests: no track-usage — cap anonymous previews in localStorage (guest_tries_used).
      if (!user && hasReachedGuestLimit()) {
        setGuestSignupOpen(true)
        return
      }
      const trimmed = dedupeConsecutiveDuplicateLines(text).trim()
      setLandingDraft(trimmed)
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

        cacheRef.current = new TranslationCache()
        setSourcePages(pages)
        setArticlePageIndex(0)
        setReadingSessionId((k) => k + 1)
        setReadEnterLastStepNonce(0)
        setReadLastConsumedEnterNonce(0)

        void cacheRef.current
          .loadPage(0, pageSourceText(pages[0]!), translatePageText)
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
        setAppState("reading")
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
    [user, bump, articlePageSplitLimits, refreshUsagePreflight],
  )

  const handleDiscoverStartReading = useCallback(
    async (content: ContentItem) => {
      const { data, error } = await supabase
        .from("discover_items")
        .select("body_text")
        .eq("id", content.id)
        .maybeSingle()
      const body = data?.body_text?.trim() ?? ""
      if (!error && body.length > 0) {
        await handleTextSubmit(body)
        return
      }
      const fallback = content.preview.trim()
      if (!fallback) return
      await handleTextSubmit(fallback)
    },
    [handleTextSubmit],
  )

  const handleBack = useCallback(() => {
    setAppState("landing")
    setSourcePages([])
    cacheRef.current = new TranslationCache()
    setArticlePageIndex(0)
    setError("")
    setRateLimitMessage(null)
    setPlanLimitModal(null)
    rateLimitModalSuppressedRef.current = false
    setViewMode("article")
    bump()
  }, [bump])

  const totalPages = sourcePages.length

  /**
   * Article next-page prefetch is intentionally disabled: the next slice is translated only
   * when the user taps Next (see goArticleNext). To revisit background preload, see README
   * “Article next-page prefetch”.
   */

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

  if (authLoading || subscriptionLoading) {
    return (
      <main className="min-h-app bg-transparent flex items-center justify-center max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden">
        <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
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
          onThemeChange={setReadingTheme}
          displayName={displayName}
        />
      </div>
      {error && (
        <AppErrorModal message={error} onDismiss={() => setError("")} />
      )}
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

    const goArticlePrev = () => {
      if (articlePageIndex <= 0) return
      setArticlePageIndex((p) => p - 1)
    }

    const goArticleNext = () => {
      if (articlePageIndex >= totalPages - 1 || articleLoading) return
      const idx = articlePageIndex + 1
      if (cache.getPage(idx) != null || cache.getError(idx) != null) {
        setArticlePageIndex((p) => p + 1)
        return
      }
      if (cache.isLoading(idx)) return
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
      setReadEnterLastStepNonce((n) => n + 1)
      setArticlePageIndex((p) => p - 1)
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
      {!IS_LOCAL_DEV && isLapsed && !popupDismissed && (
        <SubscriptionLapsedModal
          onDismiss={dismissLapsedModalAndGoHome}
          onDismissForUpgrade={dismissPopup}
        />
      )}
      <GuestSignupModal open={guestSignupOpen} onClose={() => setGuestSignupOpen(false)} />
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        {appState !== "reading" ? (
          <Route
            element={
              <LandingShellLayout
                theme={appTheme}
                onThemeChange={setReadingTheme}
                displayName={displayName}
                sidebarDisabled={appState === "loading"}
              />
            }
          >
            <Route path="/" element={landingIndexElement} />
            <Route
              path="/discover"
              element={<DiscoverPage onStartReading={handleDiscoverStartReading} />}
            />
            <Route path="/my-library" element={<MyLibraryPage />} />
          </Route>
        ) : (
          <Route path="/" element={readingHome} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
