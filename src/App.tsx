"use client"

import React, { useState, useCallback } from "react"
import { LandingScreen } from "./components/landing-screen"
import { LoadingOverlay } from "./components/loading-overlay"
import { ReadingHeader } from "./components/reading-header"
import { ArticleContent } from "./components/article-content"
import { ReadMode } from "./components/read-mode"
import { SubscriptionLapsedModal } from "./components/subscription-lapsed-modal"
import { LockedView } from "./components/locked-view"
import { useSubscription } from "./contexts/subscription-context"
import { translate } from "./lib/translate"
import type { ReconciledItem } from "./lib/translate"
import type { ViewMode } from "./components/mode-toggle"
import type { ReadingTheme } from "./components/theme-toggle"

type AppState = "landing" | "loading" | "reading"

export default function App() {
  const { isLapsed, popupDismissed, dismissPopup, isLoading: subscriptionLoading } = useSubscription()

  const [appState, setAppState] = useState<AppState>("landing")
  const [viewMode, setViewMode] = useState<ViewMode>("article")
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>("light")
  const [reconciled, setReconciled] = useState<ReconciledItem[] | null>(null)
  const [sentences, setSentences] = useState<
    { id: number; chunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }> }[]
  | null>(null)
  const [error, setError] = useState("")

  const apiKey = import.meta.env.VITE_GROQ_API_KEY

  const handleTextSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      if (isLapsed) return // Blocked — server will also reject
      if (!apiKey) {
        setError("Missing VITE_GROQ_API_KEY. Add it to your .env file.")
        return
      }
      setError("")
      setAppState("loading")

      try {
        const result = await translate(text.trim(), apiKey)
        setReconciled(result.reconciled)
        setSentences(result.sentences)
        setAppState("reading")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.")
        setAppState("landing")
      }
    },
    [apiKey, isLapsed]
  )

  const handleBack = useCallback(() => {
    setAppState("landing")
    setReconciled(null)
    setSentences(null)
    setError("")
    setViewMode("article")
  }, [])

  // Subscription lockout (App only renders for route "/")
  if (isLapsed) {
    return (
      <>
        {!popupDismissed && (
          <SubscriptionLapsedModal onDismiss={dismissPopup} />
        )}
        <LockedView />
      </>
    )
  }

  if (subscriptionLoading) {
    return (
      <main className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </main>
    )
  }

  if (appState === "landing" || appState === "loading") {
    return (
      <main className="min-h-screen bg-transparent">
        {appState === "loading" && <LoadingOverlay />}
        <LandingScreen onSubmit={handleTextSubmit} isLoading={appState === "loading"} />
        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-sm max-w-md">
            ⚠️ {error}
          </div>
        )}
      </main>
    )
  }

  const hasSentences = sentences && sentences.length > 0

  return (
    <main className={`min-h-screen bg-background ${readingTheme !== "light" ? readingTheme : ""}`}>
      <ReadingHeader mode={viewMode} onModeChange={setViewMode} onBack={handleBack} theme={readingTheme} onThemeChange={setReadingTheme} />
      <div className="animate-fade-in-up">
        {viewMode === "article" && reconciled ? (
          <ArticleContent items={reconciled} />
        ) : hasSentences ? (
          <ReadMode sentences={sentences} />
        ) : reconciled ? (
          <ArticleContent items={reconciled} />
        ) : null}
      </div>
    </main>
  )
}
