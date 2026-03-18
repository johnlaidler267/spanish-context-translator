"use client"

import { useState, useEffect } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MainHeader } from "./main-header"

interface LandingScreenProps {
  onSubmit: (text: string) => void
  isLoading: boolean
}

const PLACEHOLDERS = [
  "Pega un texto… o deja que el idioma te encuentre.",
  "Un párrafo de tu libro favorito…",
  "Una carta, un artículo, una canción perdida…",
  "El español te espera aquí.",
]

export function LandingScreen({ onSubmit, isLoading }: LandingScreenProps) {
  const [text, setText] = useState("")
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)

  useEffect(() => {
    if (text) return
    const cycle = setInterval(() => {
      setPlaceholderVisible(false)
      setTimeout(() => {
        setPlaceholderIndex(i => (i + 1) % PLACEHOLDERS.length)
        setPlaceholderVisible(true)
      }, 400)
    }, 3500)
    return () => clearInterval(cycle)
  }, [text])

  const sampleText = `El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles. Ella pensaba en su abuela, quien siempre le contaba historias de este lugar mágico.`

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim())
    }
  }

  const handleTrySample = () => {
    onSubmit(sampleText)
  }

  return (
    <>
      <MainHeader />
      <div className="min-h-screen flex flex-col items-center justify-center px-6 md:px-8">
      <div className="w-full max-w-[800px]">
        {/* Logo and tagline */}
        <div className="hero-mark text-center relative entry-1" style={{ paddingBottom: "32px" }}>
          <div className="inline-flex items-center justify-center gap-5 logo-lockup">
            <img src="/logo.png" alt="Lector" className="logo-icon h-12 md:h-14 w-auto" />
            <h1 className="wordmark font-serif text-4xl md:text-5xl font-medium" style={{ marginTop: "-4px" }}>
              Lector
            </h1>
          </div>
          <p className="subtitle font-sans" style={{ marginTop: "14px" }}>
            Read Spanish with confidence
          </p>
        </div>

        {/* Input, button, sample — unified column */}
        <div className="space-y-4">
          {/* Input box with corner ornaments */}
          <div className="relative entry-2">
            <div className="textarea-wrapper">
              <span className="corner corner-tl" aria-hidden />
              <span className="corner corner-tr" aria-hidden />
              <span className="corner corner-bl" aria-hidden />
              <span className="corner corner-br" aria-hidden />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDERS[placeholderIndex]}
                className={`textarea-field ${placeholderVisible ? "placeholder:opacity-50" : "placeholder:opacity-0"} placeholder:transition-opacity placeholder:duration-400`}
                disabled={isLoading}
              />
            </div>
            <p className="word-counter select-none absolute mt-2 right-0">
              <span className="word-counter-label">words</span>
              <span className="word-counter-value">{text.trim() ? text.trim().split(/\s+/).length.toString().padStart(2, "0") : "00"}</span>
            </p>
          </div>

          {/* CTA — same width as input */}
          <div className="space-y-2 pt-3 entry-3">
            <Button
              onClick={handleSubmit}
              disabled={!text.trim() || isLoading}
              className="btn-cta group/btn w-full h-14 text-lg font-sans font-medium relative disabled:opacity-40 bg-[#C48A7A]"
              style={{ color: "#2C1A10" }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(44,26,16,0.25)", borderTopColor: "#2C1A10" }} />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 relative z-10">
                  <span>Start Reading</span>
                  <ArrowRight className="h-5 w-5 transition-transform ease-in-out duration-[220ms] group-hover/btn:translate-x-[4px]" />
                </span>
              )}
            </Button>
            <p className="text-[10px] italic text-muted-foreground/60 mt-4 text-center">
              Supports Spanish dialects from Spain, Mexico, and Latin America.
            </p>
          </div>

          {/* Filigree divider */}
          <img src="/filigree-divider.svg" alt="" className="filigree-divider mx-auto mt-4 mb-0" aria-hidden />

          {/* Sample text preview */}
          <div className="sample-text px-2 py-4 entry-4 transition-all duration-250 ease-in-out" style={{ borderTop: "1px solid rgba(196,138,122,0.18)" }}>
            <p className="metadata-label text-[11px] font-medium uppercase tracking-[0.08em] mb-3">
              Sample text
            </p>
            <button onClick={handleTrySample} disabled={isLoading} className="text-left w-full group">
              <p className="sample-paragraph font-serif text-[15px] text-foreground/80 leading-[1.6] group-hover:text-foreground/95 transition-colors overflow-hidden italic">El sol se escondía detrás de las montañas mientras María caminaba por el sendero. Los pájaros cantaban su última canción del día, y el viento susurraba secretos entre los árboles…</p>
              <span className="sample-link text-sm text-primary mt-2 inline-flex items-center gap-1">
                Try this sample
                <span className="inline-block transition-transform ease-out duration-200 group-hover:translate-x-[3px]">→</span>
              </span>
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
