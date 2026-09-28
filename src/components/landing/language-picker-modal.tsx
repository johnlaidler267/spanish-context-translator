"use client"

import { Button } from "@/components/ui/button"
import {
  LEARNING_LANGUAGE_LABEL,
  languageOptionFlagEmoji,
  type LearningLanguage,
} from "@/lib/storage/language-learning-preferences"

/** The two languages the site has a full "flavor" for; English stays available in Settings. */
const FIRST_VISIT_CHOICES: LearningLanguage[] = ["spanish", "french"]

export interface LanguagePickerModalProps {
  onChoose: (learning: LearningLanguage) => void
  /** "Not now" / backdrop: keep the default (Spanish) and don't ask again. */
  onSkip: () => void
}

/** First visit only: asks which language the reader is learning, since Discover, voices and
 *  explanations all follow it and the switch otherwise lives in Settings. */
export function LanguagePickerModal({ onChoose, onSkip }: LanguagePickerModalProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" aria-hidden onClick={onSkip} />

      <div
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-picker-title"
      >
        <h2 id="language-picker-title" className="font-serif text-2xl font-medium text-foreground mb-2">
          What are you learning?
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Discover, read-aloud and word explanations follow your choice. You can change it anytime in
          Settings.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {FIRST_VISIT_CHOICES.map((learning) => (
            <Button
              key={learning}
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1.5 py-4 text-base"
              onClick={() => onChoose(learning)}
            >
              <span aria-hidden className="text-2xl leading-none">
                {languageOptionFlagEmoji(learning)}
              </span>
              {LEARNING_LANGUAGE_LABEL[learning]}
            </Button>
          ))}
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
