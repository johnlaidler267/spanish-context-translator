"use client"

import { BookOpen, Feather, FileText, Music } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ContentType } from "@/lib/content-data"
import { contentTypeBadgeClassNames, contentTypeLabels } from "@/lib/content-data"

const typeIcon = {
  book: BookOpen,
  article: FileText,
  song: Music,
  poem: Feather,
} as const

export interface ContentTypeBadgeProps {
  type: ContentType
  /** `sm` — grid cards & featured; `md` — preview modal */
  size?: "sm" | "md"
  className?: string
}

export function ContentTypeBadge({ type, size = "sm", className }: ContentTypeBadgeProps) {
  const Icon = typeIcon[type]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" && "gap-1 px-2.5 py-1 text-xs",
        size === "md" && "gap-1.5 px-3 py-1.5 text-sm",
        contentTypeBadgeClassNames[type],
        className,
      )}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "size-3.5" : "size-5")} aria-hidden />
      <span>{contentTypeLabels[type]}</span>
    </span>
  )
}
