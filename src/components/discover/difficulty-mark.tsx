"use client"

import type { CSSProperties } from "react"
import type { DifficultyLevel } from "@/lib/content-data"
import { cn } from "@/lib/utils"

export const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

/** Warm palette tones so levels read as part of the parchment theme, not candy pills. */
const difficultyTone: Record<DifficultyLevel, string> = {
  beginner: "#4f8a6f",
  intermediate: "#a37a2e",
  advanced: "#b4553a",
}

const difficultyFilled: Record<DifficultyLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
}

export function normalizeDifficulty(level: string): DifficultyLevel {
  const key = level.trim().toLowerCase()
  if (key === "advanced" || key === "intermediate" || key === "beginner") return key
  return "beginner"
}

export function DifficultyMark({
  level,
  className,
}: {
  level: DifficultyLevel
  className?: string
}) {
  const filled = difficultyFilled[level]
  return (
    <span
      className={cn("discover-level", className)}
      style={{ "--level-tone": difficultyTone[level] } as CSSProperties}
    >
      <span className="discover-level__dots" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn("discover-level__dot", index < filled && "discover-level__dot--on")}
          />
        ))}
      </span>
      {difficultyLabels[level]}
    </span>
  )
}
