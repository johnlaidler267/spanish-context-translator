"use client"

import { useState } from "react"
import { MainHeader } from "./main-header"

interface LandingScreenProps {
  onSubmit: (text: string) => void
  isLoading: boolean
}

const INPUT_PLACEHOLDER = "Paste or write Spanish text… (⌘↵ to read)"

export function LandingScreen({ onSubmit, isLoading }: LandingScreenProps) {
  const [text, setText] = useState("")

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
      <div className="landing-page min-h-screen flex flex-col items-center justify-center px-6 md:px-8">
      <div className="landing-column w-full max-w-[800px]">
        {/* Logo and tagline — pb-8 = 32px (4×8) */}
        <div className="hero-mark hero-mark--literary text-center relative entry-1 pt-16 md:pt-0 pb-8">
          <div className="inline-flex justify-center flex-nowrap gap-2 logo-lockup text-4xl sm:text-5xl md:text-6xl">
            <img src="/logo.png" alt="Lector" className="logo-icon w-auto flex-shrink-0" style={{ height: "0.72em" }} />
            <h1 className="wordmark font-normal whitespace-nowrap" style={{ fontSize: "1em", lineHeight: "1.15" }}>
              Lector
            </h1>
          </div>
          <p className="subtitle mt-5">
            Read Spanish with confidence
          </p>
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
                placeholder={INPUT_PLACEHOLDER}
                className="textarea-field"
                disabled={isLoading}
              />
            </div>
            <p className="word-counter select-none" aria-live="polite">
              <span className="word-counter-label">words</span>
              <span className="word-counter-value">{text.trim() ? text.trim().split(/\s+/).length.toString().padStart(2, "0") : "00"}</span>
            </p>
          </div>

          <img src="/filigree-divider.svg" alt="" className="filigree-divider mx-auto shrink-0" aria-hidden />

          {/* Sample excerpt — editorial rail, not a demo card */}
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
