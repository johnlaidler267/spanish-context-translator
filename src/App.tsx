"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Link, Navigate, Route, Routes } from "react-router-dom"
import SettingsPage from "@/pages/settings"
import { LandingScreen } from "./components/landing-screen"
import { LoadingOverlay } from "./components/loading-overlay"
import { ReadingHeader } from "./components/reading-header"
import { ArticleContent } from "./components/article-content"
import { ReadMode } from "./components/read-mode"
import { SubscriptionLapsedModal } from "./components/subscription-lapsed-modal"
import { LockedView } from "./components/locked-view"
import { useSubscription } from "./contexts/subscription-context"
import {
  buildSentencePages,
  mergeArticlePagesIfWholeTextFitsLimits,
  mergeReconciledPagesToSentences,
  pageSourceText,
  READ_MODE_WORDS_PER_STEP_MOBILE,
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
import { Button } from "./components/ui/button"
import { RateLimitModal } from "./components/rate-limit-modal"
import { isRateLimitApiMessage } from "./lib/api-errors"
import { useAuth } from "./contexts/auth-context"
import { useArticlePageSplitLimits } from "./hooks/use-article-page-split-limits"
import { GuestSignupModal } from "./components/guest-signup-modal"
import { hasReachedGuestLimit, incrementGuestUses } from "./lib/guest-usage"
import { checkLimits } from "./lib/enforce"
import {
  METRIC_CONFIG,
  broadcastUsageUpdated,
  fetchCurrentUsage,
  trackUsage,
  UsageError,
} from "./lib/usage"

type AppState = "landing" | "loading" | "reading"

// In dev, skip usage blocking unless VITE_ENFORCE_USAGE_IN_DEV=true (test modals / limits locally).
const IS_LOCAL_DEV = import.meta.env.DEV
const ENFORCE_USAGE_LIMITS =
  !IS_LOCAL_DEV || import.meta.env.VITE_ENFORCE_USAGE_IN_DEV === "true"

export default function App() {
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
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  const appTheme = readingTheme

  useEffect(() => {
    document.documentElement.classList.toggle("dark", appTheme === "dark")
    setStoredReadingTheme(appTheme)
  }, [appTheme])

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
  const [articleModeHeading, setArticleModeHeading] = useState<string | null>(null)
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
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null)
  /** After closing the rate-limit modal, don’t reopen until retry/new submit or the error clears. */
  const rateLimitModalSuppressedRef = useRef(false)
  /** Narrow viewport: shorter read-mode steps (LLM page size unchanged). */
  const [readLayoutMobile, setReadLayoutMobile] = useState(false)
  const articlePageSplitLimits = useArticlePageSplitLimits()
  const [guestSignupOpen, setGuestSignupOpen] = useState(false)

  useEffect(() => {
    if (user) setGuestSignupOpen(false)
  }, [user])

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setReadLayoutMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const handleTextSubmit = useCallback(
    async (text: string, options?: { wikipediaArticleTitle?: string }) => {
      if (!text.trim()) return
      if (!IS_LOCAL_DEV && isLapsed) return

      // Guests: no track-usage — cap anonymous previews in localStorage (guest_tries_used).
      if (!user && hasReachedGuestLimit()) {
        setGuestSignupOpen(true)
        return
      }
      const trimmed = text.trim()
      const heading = options?.wikipediaArticleTitle?.trim() ?? ""
      setArticleModeHeading(heading || null)
      setLandingDraft(trimmed)
      setError("")
      rateLimitModalSuppressedRef.current = false
      setRateLimitMessage(null)
      setPlanLimitMessage(null)
      setAppState("loading")

      try {
        let sents = splitSourceIntoSentences(trimmed)
        if (sents.length === 0) sents = [trimmed]
        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 767px)").matches
        const pageLimits = articlePageSplitLimits
        const hasMobileHeading = isMobile && Boolean(heading)
        const effectivePageLimits = hasMobileHeading
          ? {
              maxWords: Math.max(800, Math.round(pageLimits.maxWords * 0.84)),
              // Extra margin: in-flow title uses body space the char probe does not reserve.
              maxChars: Math.round(pageLimits.maxChars * 0.84 * 0.88),
            }
          : pageLimits
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
                const preflight = await fetchCurrentUsage()
                // Mirror server: each text submit bumps monthly texts and the daily counter.
                // checkLimits only inspects keys present in the increments object — include daily explicitly.
                const guard = checkLimits(preflight.counters, preflight.limits, {
                  texts_submitted: 1,
                  texts_submitted_today: 1,
                  pages_processed: pages.length,
                  chars_processed: trimmed.length,
                })
                if (!guard.allowed) {
                  const names = guard.blocked
                    .map((s) => METRIC_CONFIG[s.metric]?.label ?? s.metric)
                    .join(", ")
                  setPlanLimitMessage(
                    names
                      ? `You've reached your plan limit for: ${names}.`
                      : "You've reached a plan limit.",
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

            const usage = await trackUsage({
              texts_submitted: 1,
              chars_processed: trimmed.length,
              pages_processed: pages.length,
            })
            if (!usage.allowed && ENFORCE_USAGE_LIMITS) {
              const names = usage.exceeded.map((m) => METRIC_CONFIG[m]?.label ?? m).join(", ")
              setPlanLimitMessage(
                names
                  ? `You've reached your plan limit for: ${names}.`
                  : "You've reached a plan limit.",
              )
              setAppState("landing")
              return
            }
            broadcastUsageUpdated()
          } catch (e) {
            if (IS_LOCAL_DEV && !ENFORCE_USAGE_LIMITS) {
              console.warn("[usage] trackUsage failed; continuing in dev:", e)
            } else {
              setError(
                e instanceof UsageError
                  ? e.message
                  : "Could not verify usage. Check your connection and try again.",
              )
              setAppState("landing")
              return
            }
          }
        }

        cacheRef.current = new TranslationCache()
        setSourcePages(pages)
        setArticlePageIndex(0)
        setReadingSessionId((k) => k + 1)
        setReadEnterLastStepNonce(0)
        setReadLastConsumedEnterNonce(0)

        await cacheRef.current.loadPage(0, pageSourceText(pages[0]!), translatePageText)
        bump()
        setAppState("reading")

        // Guests: count only after success; limit is enforced before submit (modal blocks new articles).
        if (!user) incrementGuestUses()
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
    [isLapsed, user, bump, articlePageSplitLimits],
  )

  const handleBack = useCallback(() => {
    setAppState("landing")
    setSourcePages([])
    setArticleModeHeading(null)
    cacheRef.current = new TranslationCache()
    setArticlePageIndex(0)
    setError("")
    setRateLimitMessage(null)
    setPlanLimitMessage(null)
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
    setPlanLimitMessage(null)
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

  if (!IS_LOCAL_DEV && isLapsed) {
    return (
      <div className={`min-h-app bg-background ${viewportMain}`}>
        {!popupDismissed && <SubscriptionLapsedModal onDismiss={dismissPopup} />}
        <LockedView />
      </div>
    )
  }

  if (authLoading || subscriptionLoading) {
    return (
      <main className="min-h-app bg-transparent flex items-center justify-center max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden">
        <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </main>
    )
  }

  const landingHome = (
    <main className={`min-h-app bg-transparent ${viewportMain}`}>
      {appState === "loading" && <LoadingOverlay />}
      <LandingScreen
        draftText={typeof landingDraft === "string" ? landingDraft : ""}
        onDraftChange={setLandingDraft}
        onSubmit={handleTextSubmit}
        isLoading={appState === "loading"}
        theme={appTheme}
        onThemeChange={setReadingTheme}
      />
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-sm max-w-md">
          ⚠️ {error}
        </div>
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
      ? subdivideReadStepsForMobile(readSentencesMerged, READ_MODE_WORDS_PER_STEP_MOBILE)
      : subdivideReadStepsForDesktop(readSentencesMerged)

    let readStepOffset = 0
    for (let p = 0; p < articlePageIndex; p++) {
      const priorItems = cache.getPage(p)
      if (priorItems == null) continue
      const priorMerged = mergeReconciledPagesToSentences([priorItems])
      const priorSteps = readLayoutMobile
        ? subdivideReadStepsForMobile(priorMerged, READ_MODE_WORDS_PER_STEP_MOBILE)
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
        style={{
          ...(readingTheme === "light" ? {
            backgroundImage: "linear-gradient(rgba(255,252,247,0.5), rgba(255,252,247,0.5)), url(/paper-texture.png)",
            backgroundSize: "auto, 600px auto",
          } : {}),
          maxHeight: "100dvh",
        }}
      >
        <div className="shrink-0">
          <ReadingHeader
            mode={viewMode}
            onModeChange={setViewMode}
            onBack={handleBack}
            theme={readingTheme}
            onThemeChange={setReadingTheme}
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
                articleHeading={articlePageIndex === 0 ? articleModeHeading : null}
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
                articleHeading={articlePageIndex === 0 ? articleModeHeading : null}
                pagination={null}
              />
            </div>
          ) : null}
        </div>
      </main>
    )
  }

  const indexElement =
    appState === "landing" || appState === "loading" ? landingHome : readingHome ?? landingHome

  return (
    <>
      <GuestSignupModal open={guestSignupOpen} onClose={() => setGuestSignupOpen(false)} />
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={indexElement} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {(rateLimitMessage || planLimitMessage) && (
        <RateLimitModal
          message={rateLimitMessage ?? planLimitMessage!}
          onDismiss={
            rateLimitMessage
              ? dismissRateLimitModal
              : dismissPlanLimitModal
          }
          title={
            planLimitMessage && !rateLimitMessage
              ? "Plan limit reached"
              : undefined
          }
          showProviderHint={!planLimitMessage || !!rateLimitMessage}
          extraFooter={
            planLimitMessage && !rateLimitMessage && (
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
