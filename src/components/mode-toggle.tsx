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
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
          mode === "article"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <FileText className="h-4 w-4" />
        <span className="hidden sm:inline">Article</span>
      </button>
      <button
        onClick={() => onModeChange("read")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
          mode === "read"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <BookOpen className="h-4 w-4" />
        <span className="hidden sm:inline">Read</span>
      </button>
    </div>
  )
}
