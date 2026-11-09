"use client"

import { useState } from "react"
import {
  DEFAULT_DEMO_LEVEL,
  DEMO_LEVELS,
  DEMO_PASSAGES,
  type DemoLanguage,
  type DemoLevel,
} from "@/lib/landing/demo-passages"

interface LandingDemoProps {
  language: DemoLanguage
  onChangeLanguage: (language: DemoLanguage) => void
  /** Called with the chosen level when the visitor wants a full story. Hidden when null. */
  onReadStory: ((level: DemoLevel) => void) | null
}

const LANGUAGE_OPTIONS: { id: DemoLanguage; label: string }[] = [
  { id: "spanish", label: "Spanish" },
  { id: "french", label: "French" },
]

const LANG_ATTR: Record<DemoLanguage, string> = { spanish: "es", french: "fr" }

/**
 * First-visit demo: a short passage, already broken into phrases, that a visitor can hover (or
 * tap) before doing anything else -- so the first thing they see is the reader working, not an
 * empty textbox. Passages are stored (lib/landing/demo-passages.ts): instant, no AI call.
 *
 * One phrase starts expanded so the idea lands even for someone who never moves the mouse.
 * The explanation lives in a panel under the passage rather than a floating tooltip: it reads
 * the same on a phone (tap) and on desktop (hover), and can't run off the edge of the screen.
 */
export function LandingDemo({ language, onChangeLanguage, onReadStory }: LandingDemoProps) {
  const [level, setLevel] = useState<DemoLevel>(DEFAULT_DEMO_LEVEL)
  const passage = DEMO_PASSAGES[language][level]
  // The picked phrase belongs to one passage: a new language or level starts on that passage's
  // own showcase phrase.
  const passageKey = `${language}-${level}`
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(null)
  const active = picked?.key === passageKey ? picked.index : passage.initial
  const setActive = (index: number) => setPicked({ key: passageKey, index })

  const chunk = passage.chunks[active] ?? passage.chunks[0]

  return (
    <section className="landing-demo" aria-label="Try it">
      <div className="landing-demo__controls">
        <div className="landing-demo__segmented" role="group" aria-label="Language">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={language === opt.id}
              className="landing-demo__segment"
              onClick={() => onChangeLanguage(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="landing-demo__segmented" role="group" aria-label="Level">
          {DEMO_LEVELS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={level === opt.id}
              className="landing-demo__segment"
              onClick={() => setLevel(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="landing-demo__card">
        <p className="landing-demo__hint">
          <span className="landing-tagline-verb--hover">Hover any phrase</span>
          <span className="landing-tagline-verb--touch">Tap any phrase</span>
        </p>
        <p className="landing-demo__passage" lang={LANG_ATTR[language]}>
          {passage.chunks.map((c, i) => (
            <span key={`${language}-${level}-${i}`}>
              <button
                type="button"
                className="landing-demo__chunk"
                aria-pressed={i === active}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                {c.text}
              </button>{" "}
            </span>
          ))}
        </p>
        <div className="landing-demo__details" aria-live="polite">
          <p className="landing-demo__phrase" lang={LANG_ATTR[language]}>
            {chunk.text}
          </p>
          <p className="landing-demo__meaning">{chunk.meaning}</p>
          {chunk.literal && <p className="landing-demo__literal">Literally: “{chunk.literal}”</p>}
          {chunk.note && <p className="landing-demo__note">{chunk.note}</p>}
        </div>
      </div>

      {onReadStory && (
        <div className="landing-demo__next">
          <button type="button" className="landing-demo__story-btn" onClick={() => onReadStory(level)}>
            Read a full short story
          </button>
          <span className="landing-demo__or" aria-hidden="true">
            or paste your own below
          </span>
        </div>
      )}
    </section>
  )
}
