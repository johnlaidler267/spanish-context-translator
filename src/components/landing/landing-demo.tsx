"use client"

import { useRef, useState, useSyncExternalStore } from "react"
import { TextChunk } from "@/components/reading/text-chunk"
import { DEMO_LEVELS, demoPassage, type DemoLanguage, type DemoLevel } from "@/lib/landing/demo-passages"
import type { DemoCopy } from "@/lib/landing/demo-copy"
import type { LanguageLearningPreferences, NativeLanguage } from "@/lib/storage/language-learning-preferences"

interface LandingDemoProps {
  language: DemoLanguage
  /** The reader's own language: an English passage is explained in it. */
  native: NativeLanguage
  /** The two language buttons (see demoLanguageOptions). */
  languageOptions: LanguageLearningPreferences[]
  onChangeLanguage: (prefs: LanguageLearningPreferences) => void
  /** Lifted to the landing page: it also orders the short-read picks under the composer. */
  level: DemoLevel
  onChangeLevel: (level: DemoLevel) => void
  copy: DemoCopy
}

const LANG_ATTR: Record<DemoLanguage, string> = { spanish: "es", french: "fr", english: "en" }

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

/**
 * First-visit demo: a short passage, already broken into phrases, that a visitor can hover (or
 * tap) before doing anything else -- so the first thing they see is the reader working, not an
 * empty textbox. Passages are stored (lib/landing/demo-passages.ts): instant, no AI call.
 *
 * Phrases are the reader's own TextChunk, so the tooltip looks and behaves exactly like it does
 * on a real reading page (hover on desktop, touch on a phone). One phrase starts with its tooltip
 * open so the idea lands even for someone who never moves the mouse; after the visitor's first
 * hover or touch the passage behaves like the reader (a tooltip only while on a phrase / while the
 * finger is down).
 */
export function LandingDemo({
  language,
  native,
  languageOptions,
  onChangeLanguage,
  level,
  onChangeLevel,
  copy,
}: LandingDemoProps) {
  const passage = demoPassage(language, native, level)
  // The showcase phrase stays open until the visitor first touches the passage, and a new
  // language or level reopens that passage's own showcase phrase.
  const passageKey = `${language}-${native}-${level}`
  const [touchedKey, setTouchedKey] = useState<string | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const active = hovered ?? (touchedKey === passageKey ? null : passage.initial)
  const isCoarsePointer = useCoarsePointer()

  // Pointer tracking lives here, on the passage, the way the reader does it (read-mode.tsx):
  // the open tooltip follows the pointer with no easing, and moving across the gap between two
  // phrases keeps the current tooltip up instead of closing and reopening it -- otherwise each
  // phrase opened its own tooltip and slid it to the pointer, which read as a bounce.
  const track = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest(".landing-demo [data-chunk-id]")
    const id = el?.getAttribute("data-chunk-id")
    if (id == null) return
    setTouchedKey(passageKey)
    setHovered(Number(id))
    setPointer({ x: clientX, y: clientY })
  }
  const release = () => {
    setHovered(null)
    setPointer(null)
  }
  // After a touch, phones fire emulated mouse events at the same spot (mousemove etc.), and no
  // mouseleave ever follows -- left alone those reopen the tooltip the finger just lifted off
  // and leave it stuck. Ignore mouse input for a moment after any touch.
  const lastTouchAt = useRef(0)
  const fromTouch = () => {
    lastTouchAt.current = Date.now()
  }
  const isEmulatedMouse = () => Date.now() - lastTouchAt.current < 1000

  return (
    <section className="landing-demo" aria-label={copy.tryIt} lang={copy.lang}>
      <div className="landing-demo__controls">
        <div className="landing-demo__segmented" role="group" aria-label={copy.languageGroup}>
          {languageOptions.map((opt) => (
            <button
              key={opt.learning}
              type="button"
              aria-pressed={language === opt.learning}
              className="landing-demo__segment"
              onClick={() => onChangeLanguage(opt)}
            >
              {capitalize(copy.languageName[opt.learning])}
            </button>
          ))}
        </div>
        <div className="landing-demo__segmented" role="group" aria-label={copy.levelGroup}>
          {DEMO_LEVELS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={level === opt.id}
              className="landing-demo__segment"
              onClick={() => onChangeLevel(opt.id)}
            >
              {copy.levels[opt.id]}
            </button>
          ))}
        </div>
      </div>

      <div className="landing-demo__card">
        <p className="landing-demo__hint">
          <span className="landing-tagline-verb--hover">{copy.hoverVerb}</span>
          <span className="landing-tagline-verb--touch">{copy.tapVerb}</span>
        </p>
        <p
          translate="no"
          className="landing-demo__passage"
          lang={LANG_ATTR[language]}
          onMouseMove={(e) => !isEmulatedMouse() && track(e.clientX, e.clientY)}
          onMouseLeave={() => !isEmulatedMouse() && release()}
          // Touch: whichever phrase is under the finger shows its tooltip while the finger is
          // down, and it goes away when the finger lifts (or the touch is cancelled, e.g. a scroll).
          onTouchStart={(e) => {
            fromTouch()
            if (e.touches[0]) track(e.touches[0].clientX, e.touches[0].clientY)
          }}
          onTouchMove={(e) => {
            fromTouch()
            if (e.touches[0]) track(e.touches[0].clientX, e.touches[0].clientY)
          }}
          onTouchEnd={() => {
            fromTouch()
            release()
          }}
          onTouchCancel={() => {
            fromTouch()
            release()
          }}
        >
          {passage.chunks.map((c, i) => (
            <span key={`${passageKey}-${i}`}>
              <TextChunk
                chunk={{ id: i, text: c.text, meaning: c.meaning, literal: c.literal, grammar: c.note }}
                popupChunkId={active}
                isTouchHighlight={active === i}
                isPinned={false}
                onActivate={() => {}}
                onDeactivate={() => {}}
                variant="read"
                isCoarsePointer={isCoarsePointer}
                delegatePointerHover
                followPointerClient={active === i ? pointer : null}
              />
              {c.after ?? " "}
            </span>
          ))}
        </p>
      </div>

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

