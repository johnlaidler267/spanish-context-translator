"use client"

import type { ReactNode } from "react"
import { BookOpen, Feather, FileText, Music, Search, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { ContentType, DifficultyLevel } from "@/lib/content-data"

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedTypes: ContentType[]
  onTypeChange: (types: ContentType[]) => void
  selectedDifficulties: DifficultyLevel[]
  onDifficultyChange: (difficulties: DifficultyLevel[]) => void
}

const contentTypes: { type: ContentType; label: string; icon: ReactNode }[] = [
  { type: "book", label: "Books", icon: <BookOpen className="size-4" /> },
  { type: "article", label: "Articles", icon: <FileText className="size-4" /> },
  { type: "song", label: "Songs", icon: <Music className="size-4" /> },
  { type: "poem", label: "Poems", icon: <Feather className="size-4" /> },
]

const difficulties: { level: DifficultyLevel; label: string }[] = [
  { level: "beginner", label: "Beginner" },
  { level: "intermediate", label: "Intermediate" },
  { level: "advanced", label: "Advanced" },
]

export function FilterBar({
  searchQuery,
  onSearchChange,
  selectedTypes,
  onTypeChange,
  selectedDifficulties,
  onDifficultyChange,
}: FilterBarProps) {
  const toggleType = (type: ContentType) => {
    if (selectedTypes.includes(type)) {
      onTypeChange(selectedTypes.filter((t) => t !== type))
    } else {
      onTypeChange([...selectedTypes, type])
    }
  }

  const toggleDifficulty = (level: DifficultyLevel) => {
    if (selectedDifficulties.includes(level)) {
      onDifficultyChange(selectedDifficulties.filter((d) => d !== level))
    } else {
      onDifficultyChange([...selectedDifficulties, level])
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative max-w-md flex-1 overflow-visible">
        <span className="corner corner-tl" aria-hidden />
        <span className="corner corner-tr" aria-hidden />
        <span className="corner corner-bl" aria-hidden />
        <span className="corner corner-br" aria-hidden />
        <Search className="pointer-events-none absolute left-3 top-1/2 z-20 size-4 -translate-y-1/2 text-black/70 dark:text-muted-foreground" />
        <Input
          placeholder="Search content..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-none border border-border/70 bg-secondary/50 pl-10 text-black placeholder:text-black/50 shadow-sm transition-colors focus-visible:border-primary/70 focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-[#4c4640] dark:bg-[#1f1d1a] dark:text-[#f2ede4] dark:placeholder:text-[#9f978c]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex h-10 flex-wrap items-center gap-1 rounded-none border border-[#d8d1ca] bg-[#e9e4de]/95 p-1 shadow-[0_1px_2px_rgba(44,34,28,0.08)] dark:border-[#4c4640] dark:bg-[#2a2724] dark:shadow-sm"
          role="group"
          aria-label="Content type"
        >
          {contentTypes.map(({ type, label, icon }) => {
            const selected = selectedTypes.includes(type)
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleType(type)}
                className={cn(
                  "inline-flex h-full items-center gap-1.5 rounded-none px-2 py-1 text-sm font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "active:scale-[0.98]",
                  selected
                    ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20 dark:text-white"
                    : "border border-transparent bg-transparent text-[#6f625a] hover:bg-background/75 hover:text-[#3b2f2a] dark:text-white dark:hover:bg-white/10 dark:hover:text-white",
                )}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-2 rounded-none border-[#d8d1ca] bg-[#f0ece7] px-3 text-[#2f2520] shadow-[0_1px_2px_rgba(44,34,28,0.08)] hover:bg-[#f5f1ed] dark:border-[#4c4640] dark:bg-[#2a2724] dark:text-white dark:hover:bg-[#34312d] dark:hover:text-white"
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Difficulty</span>
              {selectedDifficulties.length > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {selectedDifficulties.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Difficulty Level</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {difficulties.map(({ level, label }) => (
              <DropdownMenuCheckboxItem
                key={level}
                checked={selectedDifficulties.includes(level)}
                onCheckedChange={() => toggleDifficulty(level)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
