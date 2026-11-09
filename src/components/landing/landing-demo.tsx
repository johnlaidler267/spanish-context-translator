"use client"

import { useState, useSyncExternalStore } from "react"
import { TextChunk } from "@/components/reading/text-chunk"
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
 * Phrases are the reader's own TextChunk, so the tooltip looks and behaves exactly like it does
 * on a real reading page (hover on desktop, touch on a phone). One phrase starts with its tooltip
 * open so the idea lands even for someone who never moves the mouse; after the visitor's first
 * hover or tap the passage behaves like the reader (a tooltip only while on a phrase).
 */
export function LandingDemo({ language, onChangeLanguage, onReadStory }: LandingDemoProps) {
  const [level, setLevel] = useState<DemoLevel>(DEFAULT_DEMO_LEVEL)
  const passage = DEMO_PASSAGES[language][level]
  // The showcase phrase stays open until the visitor first touches the passage, and a new
  // language or level reopens that passage's own showcase phrase.
  const passageKey = `${language}-${level}`
  const [touchedKey, setTouchedKey] = useState<string | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered ?? (touchedKey === passageKey ? null : passage.initial)
  const activate = (index: number) => {
    setTouchedKey(passageKey)
    setHovered(index)
  }
  const deactivate = (index: number) => setHovered((h) => (h === index ? null : h))
  const isCoarsePointer = useCoarsePointer()

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
        <p
          className="landing-demo__passage"
          lang={LANG_ATTR[language]}
          // Touch: the reader tracks the finger at the page level (its chunks don't open on a
          // plain tap), so do the same here -- whichever phrase is under the finger shows its
          // tooltip, and it stays up after the finger lifts.
          onTouchStart={(e) => chunkUnderTouch(e.touches[0], activate)}
          onTouchMove={(e) => chunkUnderTouch(e.touches[0], activate)}
        >
          {passage.chunks.map((c, i) => (
            <span key={`${passageKey}-${i}`}>
              <TextChunk
                chunk={{ id: i, text: c.text, meaning: c.meaning, literal: c.literal, grammar: c.note }}
                popupChunkId={active}
                isTouchHighlight={active === i}
                isPinned={false}
                onActivate={() => activate(i)}
                onDeactivate={() => deactivate(i)}
                variant="read"
                isCoarsePointer={isCoarsePointer}
              />
              {c.after ?? " "}
            </span>
          ))}
        </p>
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

/** Phone/tablet (coarse pointer): the reader places tooltips above the finger. */
const COARSE_QUERY = "(pointer: coarse)"
function subscribeCoarse(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const mq = window.matchMedia(COARSE_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => typeof window.matchMedia === "function" && window.matchMedia(COARSE_QUERY).matches,
    () => false,
  )
}

function chunkUnderTouch(touch: { clientX: number; clientY: number } | undefined, activate: (i: number) => void) {
  if (!touch) return
  const el = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".landing-demo [data-chunk-id]")
  const id = el?.getAttribute("data-chunk-id")
  if (id != null) activate(Number(id))
}
