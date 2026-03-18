"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MainHeader } from "./main-header"

interface LandingScreenProps {
  onSubmit: (text: string) => void
  isLoading: boolean
}

export function LandingScreen({ onSubmit, isLoading }: LandingScreenProps) {
  const [text, setText] = useState("")

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
      <div className="w-full max-w-2xl">
        {/* Logo and tagline */}
        <div className="text-center mb-10 md:mb-12">
          <div className="flex items-center justify-center gap-4 mb-3 md:mb-4">
            <img src="/logo.png" alt="Lector" className="h-12 md:h-14 w-auto" />
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground">
              Lector
            </h1>
          </div>
          <p className="mt-3 md:mt-4 text-lg md:text-xl text-muted-foreground font-sans">
            Read Spanish with confidence
          </p>
        </div>

        {/* Text input */}
        <div className="space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your Spanish text here..."
            className="w-full h-48 md:h-56 px-5 py-4 text-lg font-serif bg-card border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground/60 transition-shadow"
            disabled={isLoading}
          />

          {/* CTA Button */}
          <Button
            onClick={handleSubmit}
            disabled={!text.trim() || isLoading}
            className="w-full h-14 text-lg font-sans font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Start Reading
                <ArrowRight className="h-5 w-5" />
              </span>
            )}
          </Button>

          {/* Secondary option */}
          <div className="text-center pt-2">
            <button
              onClick={handleTrySample}
              disabled={isLoading}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-muted-foreground/40 hover:decoration-foreground/40 disabled:opacity-50"
            >
              Or try a sample text
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
