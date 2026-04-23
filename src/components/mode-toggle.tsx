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
        "flex items-center gap-0.5 rounded-[0.95rem] p-0.5 max-md:min-h-[2.6rem]",
        "border border-[#dccbbe]/70 bg-[rgba(250,244,237,0.82)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
        "dark:border-[#5a473b]/70 dark:bg-[rgba(42,34,29,0.72)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      )}
    >
      <button
        type="button"
        onClick={() => onModeChange("article")}
        className={cn(
          "flex items-center justify-center gap-2 rounded-[0.8rem] text-sm transition-all duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/38 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "min-h-[2.35rem] min-w-[2.35rem] px-2.25 py-1.5 max-md:min-h-[2.55rem] max-md:min-w-[2.55rem] max-md:px-2.75 max-md:py-2",
          mode === "article"
            ? "bg-[linear-gradient(180deg,rgba(201,122,90,0.82),rgba(184,108,79,0.78))] text-[#fff8f1] shadow-[0_3px_10px_rgba(184,108,79,0.16),inset_0_1px_0_rgba(255,255,255,0.14)]"
            : "font-medium text-[#746254] hover:bg-[rgba(201,122,90,0.06)] hover:text-[#4f4339] dark:text-[#ccbeb0] dark:hover:bg-[rgba(201,122,90,0.08)] dark:hover:text-[#efe3d8]"
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
          "flex items-center justify-center gap-2 rounded-[0.8rem] text-sm transition-all duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97a5a]/38 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "min-h-[2.35rem] min-w-[2.35rem] px-2.25 py-1.5 max-md:min-h-[2.55rem] max-md:min-w-[2.55rem] max-md:px-2.75 max-md:py-2",
          mode === "read"
            ? "bg-[linear-gradient(180deg,rgba(201,122,90,0.82),rgba(184,108,79,0.78))] text-[#fff8f1] shadow-[0_3px_10px_rgba(184,108,79,0.16),inset_0_1px_0_rgba(255,255,255,0.14)]"
            : "font-medium text-[#746254] hover:bg-[rgba(201,122,90,0.06)] hover:text-[#4f4339] dark:text-[#ccbeb0] dark:hover:bg-[rgba(201,122,90,0.08)] dark:hover:text-[#efe3d8]"
        )}
        aria-pressed={mode === "read"}
      >
        <BookOpen className="h-4 w-4 max-md:h-5 max-md:w-5 shrink-0" strokeWidth={2} />
        <span className="hidden sm:inline">Read</span>
      </button>
    </div>
  )
}
