"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
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
  countConsecutiveLoadedPages,
  mergeReconciledPagesToSentences,
  pageSourceText,
  pageStepRangesFromSentences,
  READ_MODE_WORDS_PER_STEP_MOBILE,
  resolvePageSplitLimits,
  splitSourceIntoSentences,
  subdivideReadStepsForMobile,
  translatePageText,
  type ReconciledItem,
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
import { hasReachedGuestLimit, incrementGuestUses } from "./lib/guest-usage"
import { trackUsage } from "./lib/usage"

type AppState = "landing" | "loading" | "reading"

// Disable all usage limits when running on localhost so dev is uninterrupted.
const IS_LOCAL_DEV = import.meta.env.DEV

export default function App() {
  const { isLapsed, popupDismissed, dismissPopup, isLoading: subscriptionLoading } = useSubscription()
  const { user, isLoading: authLoading, openAuthModal } = useAuth()

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
   * (~115 words / page desktop, ~60 mobile via resolvePageSplitLimits at submit).
   * Read mode still shows one grammatical sentence at a time; it does not change these splits.
   */
  const [sourcePages, setSourcePages] = useState<string[][]>([])
  const [articleModeHeading, setArticleModeHeading] = useState<string | null>(null)
  const [articlePageIndex, setArticlePageIndex] = useState(0)
  const [readingSessionId, setReadingSessionId] = useState(0)
  const [renderTick, setRenderTick] = useState(0)
  const bump = useCallback(() => setRenderTick((t) => t + 1), [])
  const [error, setError] = useState("")
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)
  /** After closing the rate-limit modal, don’t reopen until retry/new submit or the error clears. */
  const rateLimitModalSuppressedRef = useRef(false)
  /** Narrow viewport: shorter read-mode steps (LLM page size unchanged). */
  const [readLayoutMobile, setReadLayoutMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setReadLayoutMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const apiKey = import.meta.env.VITE_GROQ_API_KEY

  const handleTextSubmit = useCallback(
    async (text: string, options?: { wikipediaArticleTitle?: string }) => {
      if (!text.trim()) return
      if (!IS_LOCAL_DEV && isLapsed) return

      // Gate unauthenticated users after GUEST_LIMIT free uses (dev: auth modal has a bypass)
      if (!user && hasReachedGuestLimit()) {
        openAuthModal("limit")
        return
      }

      if (!apiKey) {
        setError("Missing VITE_GROQ_API_KEY. Add it to your .env file.")
        return
      }
      const trimmed = text.trim()
      const heading = options?.wikipediaArticleTitle?.trim() ?? ""
      setArticleModeHeading(heading || null)
      setLandingDraft(trimmed)
      setError("")
      rateLimitModalSuppressedRef.current = false
      setRateLimitMessage(null)
      setAppState("loading")

      try {
        let sents = splitSourceIntoSentences(trimmed)
        if (sents.length === 0) sents = [trimmed]
        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 767px)").matches
        const pageLimits = resolvePageSplitLimits(isMobile)
        const hasMobileHeading = isMobile && Boolean(heading)
        const effectivePageLimits = hasMobileHeading
          ? {
              maxWords: Math.max(42, pageLimits.maxWords - 14),
              maxChars: Math.round(pageLimits.maxChars * 0.84),
            }
          : pageLimits
        let pages = buildSentencePages(sents, effectivePageLimits)
        if (pages.length === 0) pages = [[trimmed]]

        cacheRef.current = new TranslationCache()
        setSourcePages(pages)
        setArticlePageIndex(0)
        setReadingSessionId((k) => k + 1)

        await cacheRef.current.loadPage(0, pageSourceText(pages[0]!), apiKey, translatePageText)
        bump()
        setAppState("reading")

        // Record server-side usage for signed-in users (guests use localStorage only).
        if (user) {
          trackUsage({ texts_submitted: 1 }).catch((e) => {
            console.error("Failed to record usage:", e)
          })
        }

        // Increment guest counter after a successful submission
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
    [apiKey, isLapsed, user, openAuthModal, bump],
  )

  const handleBack = useCallback(() => {
    setAppState("landing")
    setSourcePages([])
    setArticleModeHeading(null)
    cacheRef.current = new TranslationCache()
    setArticlePageIndex(0)
    setError("")
    setRateLimitMessage(null)
    rateLimitModalSuppressedRef.current = false
    setViewMode("article")
    bump()
  }, [bump])

  const totalPages = sourcePages.length

  /** Article: preload next page when current page is shown. */
  useEffect(() => {
    if (appState !== "reading" || viewMode !== "article" || !apiKey) return
    const next = articlePageIndex + 1
    if (next >= totalPages) return
    const c = cacheRef.current
    if (c.getPage(next) != null || c.isLoading(next) || c.getError(next)) return
    void c
      .loadPage(next, pageSourceText(sourcePages[next]!), apiKey, translatePageText)
      .then(bump)
      .catch(bump)
  }, [appState, viewMode, articlePageIndex, totalPages, sourcePages, apiKey, bump])

  /** Read: start loading page 1 early when there are multiple pages. */
  useEffect(() => {
    if (appState !== "reading" || viewMode !== "read") return
    if (totalPages <= 1 || !apiKey) return
    const c = cacheRef.current
    if (c.getPage(1) != null || c.isLoading(1) || c.getError(1)) return
    void c
      .loadPage(1, pageSourceText(sourcePages[1]!), apiKey, translatePageText)
      .then(bump)
      .catch(bump)
  }, [appState, viewMode, totalPages, sourcePages, apiKey, bump])

  const onRequestPreloadPage = useCallback(
    (pageIndex: number) => {
      if (pageIndex >= totalPages || !apiKey) return
      const c = cacheRef.current
      if (c.getPage(pageIndex) != null || c.isLoading(pageIndex) || c.getError(pageIndex)) return
      void c
        .loadPage(pageIndex, pageSourceText(sourcePages[pageIndex]!), apiKey, translatePageText)
        .then(bump)
        .catch(bump)
    },
    [totalPages, sourcePages, apiKey, bump],
  )

  const retryArticlePage = useCallback(() => {
    if (!apiKey || totalPages === 0) return
    rateLimitModalSuppressedRef.current = false
    const i = articlePageIndex
    cacheRef.current.clearPage(i)
    void cacheRef.current
      .loadPage(i, pageSourceText(sourcePages[i]!), apiKey, translatePageText)
      .then(bump)
      .catch(bump)
  }, [articlePageIndex, sourcePages, apiKey, totalPages, bump])

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
    }
    if (rateLimitModalSuppressedRef.current) return
    const rateMsg = messages.find(isRateLimitApiMessage)
    if (rateMsg) setRateLimitMessage(rateMsg)
  }, [error, appState, totalPages, renderTick, articlePageIndex])

  const dismissRateLimitModal = useCallback(() => {
    setRateLimitMessage(null)
    rateLimitModalSuppressedRef.current = true
  }, [])

  /** Dev: dismiss rate-limit modal, clear throttled page errors, and retry loads. */
  const devBypassRateLimit = useCallback(() => {
    setRateLimitMessage(null)
    rateLimitModalSuppressedRef.current = true
    setError("")
    const c = cacheRef.current
    const key = apiKey
    const pages = sourcePages
    if (key && pages.length > 0) {
      for (let i = 0; i < pages.length; i++) {
        const e = c.getError(i)
        if (e && isRateLimitApiMessage(e)) {
          c.clearPage(i)
          void c
            .loadPage(i, pageSourceText(pages[i]!), key, translatePageText)
            .then(bump)
            .catch(bump)
        }
      }
    }
    bump()
  }, [apiKey, sourcePages, bump])

  const viewportMain =
    "min-h-app flex flex-col max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden overflow-hidden"

  const consecutiveLoaded = countConsecutiveLoadedPages((i) => cacheRef.current.getPage(i), totalPages)
  const firstMissingPageIndex = consecutiveLoaded < totalPages ? consecutiveLoaded : null
  const readBlockedError =
    appState === "reading" && viewMode === "read" && firstMissingPageIndex != null
      ? cacheRef.current.getError(firstMissingPageIndex)
      : undefined

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
    const consecutive = countConsecutiveLoadedPages((i) => cache.getPage(i), totalPages)
    const loadedReconciled: ReconciledItem[][] = []
    for (let i = 0; i < consecutive; i++) {
      const p = cache.getPage(i)
      if (p) loadedReconciled.push(p)
    }
    const readSentencesMerged = mergeReconciledPagesToSentences(loadedReconciled)
    const readSentences = readLayoutMobile
      ? subdivideReadStepsForMobile(readSentencesMerged, READ_MODE_WORDS_PER_STEP_MOBILE)
      : readSentencesMerged
    const sentenceRangesByPage = pageStepRangesFromSentences(readSentences)

    const articleItems = cache.getPage(articlePageIndex)
    const articleErrRaw = cache.getError(articlePageIndex)
    const articleErr =
      articleErrRaw && !isRateLimitApiMessage(articleErrRaw) ? articleErrRaw : null
    const articleLoading =
      cache.isLoading(articlePageIndex) && articleItems == null && articleErrRaw == null

    const nextIdx = articlePageIndex + 1
    const nextPageOpen =
      articlePageIndex >= totalPages - 1 ||
      cache.getPage(nextIdx) != null ||
      cache.getError(nextIdx) != null
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
      if (articlePageIndex >= totalPages - 1) return
      if (!nextPageOpen) return
      setArticlePageIndex((p) => p + 1)
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
                sentences={readSentences}
                sentenceRangesByPage={sentenceRangesByPage}
                onRequestPreloadPage={onRequestPreloadPage}
              />
              {readBlockedError &&
                firstMissingPageIndex != null &&
                !isRateLimitApiMessage(readBlockedError) && (
                  <div className="shrink-0 border-t border-border/60 bg-muted/30 px-4 py-3 text-center">
                    <p className="text-sm text-muted-foreground mb-2 font-sans">{readBlockedError}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!apiKey) return
                        rateLimitModalSuppressedRef.current = false
                        const c = cacheRef.current
                        const idx = firstMissingPageIndex
                        c.clearPage(idx)
                        void c
                          .loadPage(idx, pageSourceText(sourcePages[idx]!), apiKey, translatePageText)
                          .then(bump)
                          .catch(bump)
                      }}
                    >
                      Retry loading next section
                    </Button>
                  </div>
                )}
            </div>
          ) : totalPages > 0 ? (
            <div className="flex w-full min-h-0 flex-1 flex-col">
              <ArticleContent
                items={cache.getPage(0)}
                loading={cache.isLoading(0) && cache.getPage(0) == null}
                errorMessage={(() => {
                  const e = cache.getError(0)
                  return e && !isRateLimitApiMessage(e) ? e : null
                })()}
                onRetry={
                  cache.getError(0) && apiKey && !isRateLimitApiMessage(cache.getError(0)!)
                    ? () => {
                        rateLimitModalSuppressedRef.current = false
                        cache.clearPage(0)
                        void cache
                          .loadPage(0, pageSourceText(sourcePages[0]!), apiKey, translatePageText)
                          .then(bump)
                          .catch(bump)
                      }
                    : undefined
                }
                pageKey={0}
                articleHeading={articleModeHeading}
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
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={indexElement} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {rateLimitMessage && (
        <RateLimitModal
          message={rateLimitMessage}
          onDismiss={dismissRateLimitModal}
          devBypass={IS_LOCAL_DEV ? devBypassRateLimit : undefined}
        />
      )}
    </>
  )
}
