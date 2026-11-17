"use client"

import { Button } from "@/components/ui/button"
import {
  languageOptionFlagEmoji,
  type LanguageLearningPreferences,
  browserNativeLanguage,
  type LearningLanguage,
  type NativeLanguage,
} from "@/lib/storage/language-learning-preferences"

type PickerLocale = NativeLanguage

const COPY: Record<
  PickerLocale,
  { title: string; body: string; skip: string; labels: Record<LearningLanguage, string> }
> = {
  english: {
    title: "What are you learning?",
    body: "Discover, read-aloud and word explanations follow your choice. You can change it anytime in Settings.",
    skip: "Not now",
    labels: { spanish: "Spanish", french: "French", english: "English" },
  },
  spanish: {
    title: "¿Qué idioma estás aprendiendo?",
    body: "Descubre, la lectura en voz alta y las explicaciones de palabras siguen tu elección. Puedes cambiarlo cuando quieras en Ajustes.",
    skip: "Ahora no",
    labels: { spanish: "Español", french: "Francés", english: "Inglés" },
  },
  french: {
    title: "Quelle langue apprenez-vous ?",
    body: "Découvrir, la lecture à voix haute et les explications de mots suivent votre choix. Vous pouvez le modifier à tout moment dans les Réglages.",
    skip: "Pas maintenant",
    labels: { spanish: "Espagnol", french: "Français", english: "Anglais" },
  },
}

/**
 * Choices for each visitor language. An English speaker picks Spanish or French (English stays
 * in Settings); a Spanish or French speaker most likely wants English, so it comes first, and
 * their own language stays one tap away for learners who set their phone to it for practice.
 */
function choicesFor(locale: PickerLocale): LanguageLearningPreferences[] {
  if (locale === "english") {
    return [
      { learning: "spanish", native: "english" },
      { learning: "french", native: "english" },
    ]
  }
  return [
    { learning: "english", native: locale },
    { learning: locale, native: "english" },
  ]
}

export interface LanguagePickerModalProps {
  onChoose: (prefs: LanguageLearningPreferences) => void
  /** "Not now" / backdrop: keep the default for this browser and don't ask again. */
  onSkip: () => void
  /** Overrides the browser's language (tests). */
  locale?: PickerLocale
}

/** First visit only: asks which language the reader is learning, since Discover, voices and
 *  explanations all follow it and the switch otherwise lives in Settings. Shown in the browser's
 *  language when it's Spanish or French, so a Spanish speaker can pick English without reading
 *  English first. */
export function LanguagePickerModal({ onChoose, onSkip, locale }: LanguagePickerModalProps) {
  const pickerLocale = locale ?? browserNativeLanguage()
  const copy = COPY[pickerLocale]
  const choices = choicesFor(pickerLocale)
  const langAttr = pickerLocale === "spanish" ? "es" : pickerLocale === "french" ? "fr" : "en"

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" aria-hidden onClick={onSkip} />

      <div
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-picker-title"
        lang={langAttr}
      >
        <h2 id="language-picker-title" className="font-serif text-2xl font-medium text-foreground mb-2">
          {copy.title}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">{copy.body}</p>

        <div className="grid grid-cols-2 gap-3">
          {choices.map((prefs) => (
            <Button
              key={prefs.learning}
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1.5 py-4 text-base"
              onClick={() => onChoose(prefs)}
            >
              <span aria-hidden className="text-2xl leading-none">
                {languageOptionFlagEmoji(prefs.learning)}
              </span>
              {copy.labels[prefs.learning]}
            </Button>
          ))}
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {copy.skip}
        </button>
      </div>
    </div>
  )
}
