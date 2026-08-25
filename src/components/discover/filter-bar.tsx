"use client"

import type { ReactNode } from "react"
import { BookOpen, Feather, FileText, Music, Search, SlidersHorizontal, X } from "lucide-react"
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
  { type: "book", label: "Books", icon: <BookOpen className="size-4" aria-hidden /> },
  { type: "article", label: "Articles", icon: <FileText className="size-4" aria-hidden /> },
  { type: "song", label: "Songs", icon: <Music className="size-4" aria-hidden /> },
  { type: "poem", label: "Poems", icon: <Feather className="size-4" aria-hidden /> },
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
    <div className="discover-filters">
      <div className="discover-search">
        <span className="corner corner-tl" aria-hidden />
        <span className="corner corner-tr" aria-hidden />
        <span className="corner corner-bl" aria-hidden />
        <span className="corner corner-br" aria-hidden />
        <Search className="discover-search__icon" aria-hidden />
        <Input
          placeholder="Search by title, author, or tag…"
          value={searchQuery}
          aria-label="Search content"
          onChange={(e) => onSearchChange(e.target.value)}
          className="discover-search__input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="discover-search__clear"
            aria-label="Clear search"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="discover-filters__controls">
        <div className="discover-seg" role="group" aria-label="Content type">
          {contentTypes.map(({ type, label, icon }) => (
            <button
              key={type}
              type="button"
              aria-pressed={selectedTypes.includes(type)}
              onClick={() => toggleType(type)}
              className="discover-seg__btn"
              title={label}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("discover-trigger", selectedDifficulties.length > 0 && "discover-trigger--active")}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              <span className="hidden sm:inline">Difficulty</span>
              {selectedDifficulties.length > 0 && (
                <span className="discover-trigger__count">{selectedDifficulties.length}</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Difficulty level</DropdownMenuLabel>
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
