"use client"

import type { ReactNode } from "react"
import { BookOpen, Feather, FileText, Music, Search, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search content..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="border-border/50 bg-secondary/50 pl-10 focus:border-primary/50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-secondary/50 p-1">
          {contentTypes.map(({ type, label, icon }) => (
            <Button
              key={type}
              type="button"
              variant={selectedTypes.includes(type) ? "default" : "ghost"}
              size="sm"
              onClick={() => toggleType(type)}
              className={`gap-1.5 ${
                selectedTypes.includes(type)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2 border-border/50">
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
