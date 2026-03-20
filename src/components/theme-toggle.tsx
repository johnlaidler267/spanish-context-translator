"use client"

import { cn } from "@/lib/utils"

export type ReadingTheme = "light" | "sepia" | "dark"

interface ThemeToggleProps {
  theme: ReadingTheme
  onThemeChange: (theme: ReadingTheme) => void
}

const THEMES: { id: ReadingTheme; label: string; bg: string; ring: string }[] = [
  { id: "light", label: "Light",  bg: "bg-[#f7f3ee]",  ring: "ring-[#c97a5a]/35" },
  { id: "sepia", label: "Sunset", bg: "bg-[#F4E6D6]",  ring: "ring-[#c4967a]" },
  { id: "dark",  label: "Dark",   bg: "bg-[#1A1A1A]",  ring: "ring-[#4a4642]" },
]

export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Reading theme">
      {THEMES.map(t => (
        <button
          key={t.id}
          onClick={() => onThemeChange(t.id)}
          aria-label={t.label}
          className={cn(
            "w-4 h-4 rounded-full border border-black/10 transition-all duration-200 ease-in-out",
            t.bg,
            theme === t.id
              ? `ring-2 ring-offset-1 ${t.ring} scale-110`
              : "opacity-60 hover:opacity-100 hover:scale-105"
          )}
        />
      ))}
    </div>
  )
}
