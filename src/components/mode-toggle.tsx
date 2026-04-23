"use client"

import { FileText, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

export type ViewMode = "article" | "read"

interface ModeToggleProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-[1.15rem] p-1 max-md:min-h-[2.75rem]",
        "border border-[#d6c3b4] bg-[linear-gradient(180deg,rgba(251,246,240,0.98),rgba(243,234,224,0.95))]",
        "shadow-[0_10px_26px_rgba(92,69,49,0.10),inset_0_1px_0_rgba(255,255,255,0.82)]",
        "dark:border-[#5e493c] dark:bg-[linear-gradient(180deg,rgba(42,34,29,0.96),rgba(34,28,24,0.94))] dark:shadow-[0_12px_30px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]",
      )}
    >
      <button
        type="button"
        onClick={() => onModeChange("article")}
        className={cn(
          "flex items-center justify-center gap-2 rounded-[0.9rem] text-sm transition-all duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/38 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "min-h-[2.5rem] min-w-[2.5rem] px-2.5 py-2 max-md:min-h-[2.75rem] max-md:min-w-[2.75rem] max-md:px-3 max-md:py-2.5",
          mode === "article"
            ? "bg-[linear-gradient(180deg,#cf8462,#b86c4f)] text-[#fff9f2] shadow-[0_8px_18px_rgba(184,108,79,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
            : "font-medium text-[#6e5949] hover:bg-[rgba(201,122,90,0.08)] hover:text-[#4a3d33] dark:text-[#d0c0b3] dark:hover:bg-[rgba(201,122,90,0.10)] dark:hover:text-[#f3e7dc]"
        )}
        aria-pressed={mode === "article"}
      >
        <FileText className="h-4 w-4 max-md:h-5 max-md:w-5 shrink-0" strokeWidth={2} />
        <span className="hidden sm:inline">Article</span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange("read")}
        className={cn(
          "flex items-center justify-center gap-2 rounded-[0.9rem] text-sm transition-all duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/38 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "min-h-[2.5rem] min-w-[2.5rem] px-2.5 py-2 max-md:min-h-[2.75rem] max-md:min-w-[2.75rem] max-md:px-3 max-md:py-2.5",
          mode === "read"
            ? "bg-[linear-gradient(180deg,#cf8462,#b86c4f)] text-[#fff9f2] shadow-[0_8px_18px_rgba(184,108,79,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
            : "font-medium text-[#6e5949] hover:bg-[rgba(201,122,90,0.08)] hover:text-[#4a3d33] dark:text-[#d0c0b3] dark:hover:bg-[rgba(201,122,90,0.10)] dark:hover:text-[#f3e7dc]"
        )}
        aria-pressed={mode === "read"}
      >
        <BookOpen className="h-4 w-4 max-md:h-5 max-md:w-5 shrink-0" strokeWidth={2} />
        <span className="hidden sm:inline">Read</span>
      </button>
    </div>
  )
}
