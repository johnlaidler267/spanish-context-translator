"use client"

import { BookOpen, Feather, FileText, Globe2, Music, Timer } from "lucide-react"
import type { CSSProperties } from "react"
import { ContentTypeBadge } from "@/components/discover/content-type-badge"
import type { ContentItem, ContentType } from "@/lib/content-data"

const typeIcon = {
  book: BookOpen,
  article: FileText,
  song: Music,
  poem: Feather,
} as const

const PALETTES: Record<ContentType, Array<{ accent: string; glow: string; ink: string; wash: string }>> = {
  book: [
    { accent: "#b86b4e", glow: "rgba(224, 151, 108, 0.34)", ink: "#2f1b12", wash: "#f4e0cf" },
    { accent: "#a55f3f", glow: "rgba(179, 124, 91, 0.3)", ink: "#2b1d19", wash: "#ead8c1" },
    { accent: "#8f6a2e", glow: "rgba(203, 167, 92, 0.28)", ink: "#2d2417", wash: "#efe1c6" },
  ],
  article: [
    { accent: "#3d7a96", glow: "rgba(87, 165, 198, 0.28)", ink: "#142532", wash: "#dbeaf0" },
    { accent: "#356d86", glow: "rgba(96, 160, 191, 0.24)", ink: "#172733", wash: "#d7e6ee" },
    { accent: "#5a6f89", glow: "rgba(113, 142, 177, 0.28)", ink: "#1a2230", wash: "#dde5ef" },
  ],
  song: [
    { accent: "#7b5bd6", glow: "rgba(143, 112, 234, 0.32)", ink: "#201634", wash: "#e8defd" },
    { accent: "#8a4fb8", glow: "rgba(176, 109, 210, 0.28)", ink: "#261730", wash: "#eddcf8" },
    { accent: "#5d67cf", glow: "rgba(114, 128, 227, 0.3)", ink: "#1f2140", wash: "#dfe3fb" },
  ],
  poem: [
    { accent: "#3f8e74", glow: "rgba(92, 178, 146, 0.28)", ink: "#142b24", wash: "#dcefe8" },
    { accent: "#517f63", glow: "rgba(114, 168, 136, 0.24)", ink: "#18271f", wash: "#e0ebdf" },
    { accent: "#2d8d8c", glow: "rgba(78, 188, 185, 0.24)", ink: "#132828", wash: "#dbf1f0" },
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
  variant: "featured" | "card"
  className?: string
}

export function DiscoverCoverArt({ content, variant, className = "" }: DiscoverCoverArtProps) {
  const Icon = typeIcon[content.type]
  const palette = paletteForContent(content)
  const style = {
    "--discover-cover-accent": palette.accent,
    "--discover-cover-glow": palette.glow,
    "--discover-cover-ink": palette.ink,
    "--discover-cover-wash": palette.wash,
    "--discover-cover-image": content.coverImage ? `url("${content.coverImage}")` : "none",
  } as CSSProperties

  return (
    <div
      className={`discover-cover-art discover-cover-art--${variant} ${className}`.trim()}
      style={style}
    >
      <div className="discover-cover-art__media" aria-hidden />
      <div className="discover-cover-art__wash" aria-hidden />
      <div className="discover-cover-art__grain" aria-hidden />

      <div className="discover-cover-art__inner">
        <div className="discover-cover-art__topline">
          <ContentTypeBadge type={content.type} size="sm" className="discover-cover-art__badge" />
          <span className="discover-cover-art__language">
            <Globe2 className="size-3.5" aria-hidden />
            {content.language}
          </span>
        </div>

        <div className="discover-cover-art__body">
          <div className="discover-cover-art__motif" aria-hidden>
            <Icon className="discover-cover-art__motif-icon" />
          </div>
          <div className="discover-cover-art__copy">
            <p className="discover-cover-art__eyebrow">{content.author}</p>
            <h3 className="discover-cover-art__title">{content.title}</h3>
          </div>
        </div>

        <div className="discover-cover-art__footer">
          <span className="discover-cover-art__meta">
            <Timer className="size-3.5" aria-hidden />
            {content.estimatedTime}
          </span>
          <span className="discover-cover-art__meta discover-cover-art__meta--strong">
            {content.wordCount.toLocaleString()} words
          </span>
        </div>
      </div>
    </div>
  )
}
