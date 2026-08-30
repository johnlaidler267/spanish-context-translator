"use client"

import { useState } from "react"
import { BookOpen, Feather, FileText, Music } from "lucide-react"
import type { CSSProperties } from "react"
import type { ContentItem, ContentType } from "@/lib/discover/content-data"

const typeIcon = {
  book: BookOpen,
  article: FileText,
  song: Music,
  poem: Feather,
} as const

const PALETTES: Record<ContentType, Array<{ accent: string; ink: string; wash: string }>> = {
  book: [
    { accent: "#b86b4e", ink: "#4a2c1c", wash: "#f1dcc8" },
    { accent: "#a55f3f", ink: "#452a1e", wash: "#ecd8c1" },
    { accent: "#8f6a2e", ink: "#3f3117", wash: "#f0e3c7" },
  ],
  article: [
    { accent: "#3d7a96", ink: "#1b3444", wash: "#dcebf1" },
    { accent: "#356d86", ink: "#1d3542", wash: "#d8e7ef" },
    { accent: "#5a6f89", ink: "#232f3f", wash: "#dee6f0" },
  ],
  song: [
    { accent: "#7b5bd6", ink: "#2a1e46", wash: "#e7ddfc" },
    { accent: "#8a4fb8", ink: "#331f40", wash: "#eddcf8" },
    { accent: "#5d67cf", ink: "#262a4e", wash: "#dfe3fb" },
  ],
  poem: [
    { accent: "#3f8e74", ink: "#1b3a30", wash: "#dcefe8" },
    { accent: "#517f63", ink: "#20342a", wash: "#e1ebdf" },
    { accent: "#2d8d8c", ink: "#173534", wash: "#dbf1f0" },
  ],
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function paletteForContent(content: ContentItem) {
  const set = PALETTES[content.type]
  return set[hashString(`${content.title}:${content.author}:${content.language}`) % set.length]
}

type DiscoverCoverArtProps = {
  content: ContentItem
  className?: string
  /** Featured cards are above the fold — skip lazy loading so they paint immediately. */
  eager?: boolean
}

export function DiscoverCoverArt({ content, className = "", eager = false }: DiscoverCoverArtProps) {
  const [imageBroken, setImageBroken] = useState(false)
  const source = content.coverImage?.trim() ?? ""

  if (source && !imageBroken) {
    return (
      <div className={`discover-cover ${className}`.trim()}>
        <img
          src={source}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="discover-cover__img"
          onError={() => setImageBroken(true)}
        />
        <div className="discover-cover__vignette" aria-hidden />
      </div>
    )
  }

  const Icon = typeIcon[content.type]
  const palette = paletteForContent(content)
  const style = {
    "--cover-accent": palette.accent,
    "--cover-ink": palette.ink,
    "--cover-wash": palette.wash,
  } as CSSProperties

  return (
    <div className={`discover-cover discover-cover--plate ${className}`.trim()} style={style}>
      <span className="discover-cover__rule" aria-hidden />
      <Icon className="discover-cover__motif" aria-hidden />
      <p className="discover-cover__plate-title">{content.title}</p>
      <p className="discover-cover__plate-author">{content.author}</p>
    </div>
  )
}
