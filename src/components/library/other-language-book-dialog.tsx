"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  LEARNING_LANGUAGE_LABEL,
  type LearningLanguage,
} from "@/lib/storage/language-learning-preferences"

/**
 * Shown instead of opening an uploaded book written in a language other than the one being
 * learned -- reading it in the wrong mode would translate it as the wrong language. Most often
 * reached by uploading, say, a Spanish book while in French mode (the upload opens straight
 * away); the Library and Continue Reading already hide other-language books otherwise.
 */
export function OtherLanguageBookDialog({
  book,
  onSwitch,
  onCancel,
}: {
  book: { title: string; language: LearningLanguage } | null
  onSwitch: () => void
  onCancel: () => void
}) {
  const label = book ? LEARNING_LANGUAGE_LABEL[book.language] : ""
  return (
    <Dialog open={book != null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-medium">This book is in {label}</DialogTitle>
          <DialogDescription>
            Switch to {label} to read “{book?.title}”? You can switch back any time, and your
            other books will be right where you left them.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-2">
          <Button onClick={onSwitch}>Switch to {label}</Button>
          <Button variant="ghost" onClick={onCancel}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
