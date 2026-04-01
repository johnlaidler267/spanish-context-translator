"use client"

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react"
import { useVirtualKeyboardLayoutFix } from "@/hooks/use-virtual-keyboard-layout-fix"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import { MainHeader } from "./main-header"
import { LandingContentPills } from "./landing-content-pills"
import {
  appendTranscriptToField,
  fetchLearnRandomParagraph,
  generateRandomSpanish,
} from "@/lib/translate"
import { VoiceInputButton } from "./voice-input-button"
import type { ReadingTheme } from "./theme-toggle"

interface LandingScreenProps {
  draftText: string
  onDraftChange: Dispatch<SetStateAction<string>>
  onSubmit: (text: string, options?: { wikipediaArticleTitle?: string }) => void
  isLoading: boolean
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
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
}: LandingScreenProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const landingColumnRef = useRef<HTMLDivElement>(null)
  useVirtualKeyboardLayoutFix(landingColumnRef)
  const [isRolling, setIsRolling] = useState(false)
  const [isLearning, setIsLearning] = useState(false)
  const [learnError, setLearnError] = useState<string | null>(null)
  const learnArticleTitleRef = useRef<string | null>(null)
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
    setIsRolling(true)
    try {
      const paragraph = await generateRandomSpanish()
      learnArticleTitleRef.current = null
      setText(paragraph)
    } finally {
      setIsRolling(false)
    }
  }

  const handleLearnPill = async () => {
    if (isLearning || isLoading) return
    setLearnError(null)
    setIsLearning(true)
    try {
      const { title, intro } = await fetchLearnRandomParagraph()
      learnArticleTitleRef.current = title
      setText(intro)
    } catch (e) {
      setLearnError(e instanceof Error ? e.message : "No se pudo generar el texto.")
    } finally {
      setIsLearning(false)
    }
  }

  const sampleText = `El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles. Ella pensaba en su abuela, quien siempre le contaba historias de este lugar mágico.`

  const handleSubmit = () => {
    if (!text.trim()) return
    const wiki = learnArticleTitleRef.current?.trim() ?? ""
    onSubmit(text.trim(), wiki ? { wikipediaArticleTitle: wiki } : undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTrySample = () => {
    learnArticleTitleRef.current = null
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
      <MainHeader theme={theme} onThemeChange={onThemeChange} showPlanBanner />
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
            <em>Hola</em>, ready to read?
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
              learnError={learnError}
            />
            <div className="order-2 md:order-1 flex flex-col gap-2 w-full relative md:pb-1">
            <div className="textarea-wrapper w-full">
              <span className="corner corner-tl" aria-hidden />
              <span className="corner corner-tr" aria-hidden />
              <span className="corner corner-bl" aria-hidden />
              <span className="corner corner-br" aria-hidden />
              <div className="textarea-input-area">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => { learnArticleTitleRef.current = null; setText(e.target.value) }}
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
              <div className="textarea-toolbar max-md:justify-end md:justify-start" aria-label="Composer actions">
                <div className="textarea-toolbar-right">
                  <button
                    type="button"
                    onClick={handleSubmit}
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
            <p
              className="word-counter word-counter--anchored max-md:hidden md:flex select-none min-w-0"
              aria-live="polite"
            >
              <span className="word-counter-label">words</span>
              <span className="word-counter-value">{text.trim() ? text.trim().split(/\s+/).length.toString().padStart(2, "0") : "00"}</span>
            </p>
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
    </>
  )
}
