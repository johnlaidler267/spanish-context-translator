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
    <div className="flex items-center gap-0.5 md:gap-1 p-0.5 md:p-1 bg-secondary rounded-lg max-md:min-h-[2.75rem]">
      <button
        type="button"
        onClick={() => onModeChange("article")}
        className={cn(
          "flex items-center justify-center gap-2 rounded-md text-sm transition-all duration-200 ease-in-out",
          "min-h-[2.5rem] min-w-[2.5rem] px-2.5 py-2 max-md:min-h-[2.75rem] max-md:min-w-[2.75rem] max-md:px-3 max-md:py-2.5",
          mode === "article"
            ? "bg-[#c97a5a] text-white font-semibold shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)]"
            : "font-medium text-foreground border border-border/60 hover:border-border"
        )}
      >
        <FileText className="h-4 w-4 max-md:h-5 max-md:w-5 shrink-0" />
        <span className="hidden sm:inline">Article</span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange("read")}
        className={cn(
          "flex items-center justify-center gap-2 rounded-md text-sm transition-all duration-200 ease-in-out",
          "min-h-[2.5rem] min-w-[2.5rem] px-2.5 py-2 max-md:min-h-[2.75rem] max-md:min-w-[2.75rem] max-md:px-3 max-md:py-2.5",
          mode === "read"
            ? "bg-[#c97a5a] text-white font-semibold shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)]"
            : "font-medium text-foreground border border-border/60 hover:border-border"
        )}
      >
        <BookOpen className="h-4 w-4 max-md:h-5 max-md:w-5 shrink-0" />
        <span className="hidden sm:inline">Read</span>
      </button>
    </div>
  )
}
