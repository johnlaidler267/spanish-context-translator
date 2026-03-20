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
    <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg">
      <button
        onClick={() => onModeChange("article")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-200 ease-in-out",
          mode === "article"
            ? "bg-[#c97a5a] text-white font-semibold shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)]"
            : "font-medium text-foreground border border-border/60 hover:border-border"
        )}
      >
        <FileText className="h-4 w-4" />
        <span className="hidden sm:inline">Article</span>
      </button>
      <button
        onClick={() => onModeChange("read")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-200 ease-in-out",
          mode === "read"
            ? "bg-[#c97a5a] text-white font-semibold shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)]"
            : "font-medium text-foreground border border-border/60 hover:border-border"
        )}
      >
        <BookOpen className="h-4 w-4" />
        <span className="hidden sm:inline">Read</span>
      </button>
    </div>
  )
}
