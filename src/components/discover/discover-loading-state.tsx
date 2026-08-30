"use client"

import { Library, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

function Shimmer({ className }: { className: string }) {
  return <span aria-hidden className={cn("discover-loading-shimmer block", className)} />
}

function SkeletonCard({ featured = false }: { featured?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("discover-card discover-card--skeleton", featured && "discover-card--featured")}
    >
      <div className="discover-card__frame">
        <Shimmer className="h-full w-full" />
      </div>
      <div className="discover-card__body">
        <Shimmer className="h-3 w-1/2 rounded-full" />
        <Shimmer className="mt-2 h-4 w-4/5 rounded-full" />
        <Shimmer className="mt-1.5 h-4 w-3/5 rounded-full" />
        <div className="discover-card__meta">
          <Shimmer className="h-2.5 w-20 rounded-full" />
          <Shimmer className="h-2.5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function DiscoverLoadingState() {
  return (
    <section
      className="discover-loading"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading discover catalog"
    >
      <div className="discover-loading__section">
        <div className="discover-heading">
          <span className="discover-heading__mark" aria-hidden>
            <Sparkles className="size-4" aria-hidden />
          </span>
          <h2 className="discover-heading__label">Featured for you</h2>
          <span className="discover-heading__rule" aria-hidden />
        </div>
        <div className="discover-grid discover-grid--featured">
          {Array.from({ length: 2 }).map((_, index) => (
            <SkeletonCard key={`featured-${index}`} featured />
          ))}
        </div>
      </div>

      <div className="discover-loading__section">
        <div className="discover-heading">
          <span className="discover-heading__mark" aria-hidden>
            <Library className="size-4" aria-hidden />
          </span>
          <h2 className="discover-heading__label">The library</h2>
          <span className="discover-heading__rule" aria-hidden />
        </div>
        <div className="discover-filters" aria-hidden>
          <Shimmer className="h-10 max-w-[26rem] flex-1 basis-60" />
          <Shimmer className="h-10 w-28" />
          <Shimmer className="h-10 w-24" />
        </div>
        <div className="discover-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonCard key={`card-${index}`} />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading catalog</span>
    </section>
  )
}
