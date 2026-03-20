"use client"

import { useState, useEffect } from "react"
import { Dices } from "lucide-react"
import { MainHeader } from "./main-header"
import { generateRandomSpanish } from "@/lib/translate"

interface LandingScreenProps {
  onSubmit: (text: string) => void
  isLoading: boolean
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

export function LandingScreen({ onSubmit, isLoading }: LandingScreenProps) {
  const [text, setText] = useState("")
  const [isRolling, setIsRolling] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)
  const [focused, setFocused] = useState(false)

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

  return (
    <>
      <MainHeader />
      <div className="landing-page min-h-screen flex flex-col items-center justify-center px-6 md:px-8" style={{ position: "relative" }}>
        <img
          src="/landing-bg.png"
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            opacity: 0.22,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      <div className="landing-column w-full max-w-[800px]" style={{ position: "relative", zIndex: 1 }}>
        {/* Logo and tagline — pb-8 = 32px (4×8) */}
        <div className="hero-mark hero-mark--literary text-center relative entry-1 pt-16 md:pt-0 pb-8">
          <h1 className="wordmark font-normal text-3xl sm:text-4xl md:text-5xl" style={{ lineHeight: "1.15" }}>
            Hola, ready to read?
          </h1>
        </div>

        {/* Main stack: 24px (3×8) — room to breathe around ornament */}
        <div className="flex flex-col gap-6 w-full">
          {/* Composer: input + word count share width; 8px between */}
          <div className="entry-2 flex flex-col gap-2 w-full">
            <div className="textarea-wrapper w-full">
              <span className="corner corner-tl" aria-hidden />
              <span className="corner corner-tr" aria-hidden />
              <span className="corner corner-bl" aria-hidden />
              <span className="corner corner-br" aria-hidden />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder=""
                className="textarea-field"
                disabled={isLoading}
              />
              {!text && !focused && (
                <span className="animated-placeholder" style={{ opacity: placeholderVisible ? 1 : 0 }}>
                  {PLACEHOLDERS[placeholderIndex]}
                </span>
              )}
              <button
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
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || isLoading}
                className={`submit-arrow-btn ${text.trim() ? "submit-arrow-btn--visible" : ""}`}
                aria-label="Start reading"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
            <p className="word-counter select-none text-right" aria-live="polite">
              <span className="word-counter-label">words</span>
              <span className="word-counter-value">{text.trim() ? text.trim().split(/\s+/).length.toString().padStart(2, "0") : "00"}</span>
            </p>
          </div>

          <img src="/filigree-divider.svg" alt="" className="filigree-divider mx-auto shrink-0" aria-hidden />

          {/* Sample excerpt */}
          <div className="sample-text w-full entry-4 mt-3">
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
