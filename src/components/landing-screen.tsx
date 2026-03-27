"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useVirtualKeyboardLayoutFix } from "@/hooks/use-virtual-keyboard-layout-fix"
import { beginRouteTransition, cancelRouteTransition } from "@/lib/route-transition-shell"
import { Dices } from "lucide-react"
import { MainHeader } from "./main-header"
import { appendTranscriptToField, generateRandomSpanish } from "@/lib/translate"
import { VoiceInputButton } from "./voice-input-button"
import type { ReadingTheme } from "./theme-toggle"

interface LandingScreenProps {
  onSubmit: (text: string) => void
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

export function LandingScreen({ onSubmit, isLoading, theme, onThemeChange }: LandingScreenProps) {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const landingColumnRef = useRef<HTMLDivElement>(null)
  useVirtualKeyboardLayoutFix(landingColumnRef)
  const [isRolling, setIsRolling] = useState(false)
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

  const apiKey = import.meta.env.VITE_GROQ_API_KEY

  const handleDiceRoll = async () => {
    if (isRolling || !apiKey) return
    setIsRolling(true)
    try {
      const paragraph = await generateRandomSpanish(apiKey)
      setText(paragraph)
    } finally {
      setIsRolling(false)
    }
  }

  const sampleText = `El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles. Ella pensaba en su abuela, quien siempre le contaba historias de este lugar mágico.`

  const handleSubmit = () => {
    if (text.trim()) onSubmit(text.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
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
      <MainHeader theme={theme} onThemeChange={onThemeChange} showPlanBanner />
      <div
        className="landing-page flex flex-col items-stretch md:items-center md:justify-center min-h-app max-md:min-h-0 max-md:flex-1 max-md:overflow-hidden px-3 md:px-8"
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
        className="landing-column w-full max-w-[800px] flex flex-col flex-1 min-h-0 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto max-md:overflow-x-hidden md:flex-none md:justify-start gap-4 md:gap-6 max-md:pt-[max(7.5rem,calc(env(safe-area-inset-top,0px)+5.75rem))] md:pt-0"
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* Hero — mobile: fills space above composer; desktop: top */}
        <div className="hero-mark hero-mark--literary text-center relative entry-1 order-1 flex flex-col flex-1 justify-center items-center min-h-0 md:flex-none md:block md:pb-8 pt-2 md:pt-0 pb-2 md:pb-8">
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
        <div className="order-2 md:order-2 flex flex-col gap-2 w-full shrink-0 mt-auto md:mt-0 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] md:pb-0">
          <img
            src="/filigree-divider.svg"
            alt=""
            className="filigree-divider order-1 md:order-2 mx-auto shrink-0"
            aria-hidden
          />
          <div className="entry-2 order-2 md:order-1 flex flex-col gap-2 w-full">
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
                <button
                  type="button"
                  onClick={handleDiceRoll}
                  disabled={isRolling}
                  className="dice-btn"
                  aria-label="Generate a random Spanish paragraph"
                >
                  {isRolling ? (
                    <span className="dice-spinner" />
                  ) : (
                    <Dices className="dice-icon" />
                  )}
                </button>
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
                    apiKey={apiKey}
                    disabled={isLoading}
                    onTranscript={(t) => setText((prev) => appendTranscriptToField(prev, t))}
                  />
                </div>
              </div>
            </div>
            <div className="hidden md:flex w-full items-center justify-end">
              <p className="word-counter select-none min-w-0" aria-live="polite">
                <span className="word-counter-label">words</span>
                <span className="word-counter-value">{text.trim() ? text.trim().split(/\s+/).length.toString().padStart(2, "0") : "00"}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Sample excerpt — desktop/tablet only */}
        <div className="sample-text w-full entry-4 order-3 md:order-3 mt-0 md:mt-3 hidden md:block">
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
    {/* Outside .landing-route-enter: transform on that ancestor breaks viewport-fixed; z-0 paints under shell z-10 */}
    <img
      src="/landing-branch-botanical.png"
      alt=""
      aria-hidden
      className="pointer-events-none hidden max-md:block max-md:fixed max-md:z-0 max-md:bottom-0 max-md:right-0 max-md:w-[min(75vw,35rem)] max-md:max-h-[min(50vh,30rem)] h-auto max-md:object-contain max-md:object-right-bottom opacity-[0.8] dark:opacity-[0.0] select-none"
    />
    </>
  )
}
