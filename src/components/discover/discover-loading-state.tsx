"use client"

import { Compass, Sparkles } from "lucide-react"

function ShimmerBlock({ className }: { className: string }) {
  return <div aria-hidden className={`discover-loading-shimmer ${className}`} />
}

export function DiscoverLoadingState() {
  return (
    <section
      className="discover-loading-shell"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading discover catalog"
    >
      <div className="discover-loading-intro">
        <div className="discover-loading-chip">
          <Sparkles className="size-3.5" aria-hidden />
          <span>Curating your next read</span>
        </div>
        <div className="discover-loading-copy">
          <h2 className="discover-loading-title">Building the shelf around you</h2>
          <p className="discover-loading-text">
            Pulling in featured picks, fresh finds, and level-matched reads.
          </p>
        </div>
        <div className="discover-loading-progress" aria-hidden>
          <span />
        </div>
      </div>

      <div className="discover-loading-section">
        <div className="discover-loading-section-head">
          <div className="discover-loading-section-label">
            <Sparkles className="size-4" aria-hidden />
            <span>Featured for You</span>
          </div>
        </div>
        <div className="discover-loading-feature-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={`feature-${index}`} className="discover-loading-feature-card">
              <div className="discover-loading-feature-image">
                <ShimmerBlock className="h-full w-full" />
              </div>
              <div className="discover-loading-feature-overlay">
                <ShimmerBlock className="h-6 w-20 rounded-full" />
                <ShimmerBlock className="mt-4 h-7 w-[78%] rounded-sm" />
                <ShimmerBlock className="mt-2 h-4 w-28 rounded-sm" />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="discover-loading-section">
        <div className="discover-loading-section-head discover-loading-section-head--stacked">
          <div className="discover-loading-section-label">
            <Compass className="size-4" aria-hidden />
            <span>Browse All Content</span>
          </div>
          <div className="discover-loading-filterbar">
            <ShimmerBlock className="h-11 flex-1 rounded-[1.1rem]" />
            <ShimmerBlock className="h-11 w-28 rounded-full" />
            <ShimmerBlock className="h-11 w-32 rounded-full" />
          </div>
        </div>
        <div className="discover-loading-card-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={`card-${index}`} className="discover-loading-card">
              <div className="discover-loading-card-image">
                <ShimmerBlock className="h-full w-full" />
              </div>
              <div className="discover-loading-card-body">
                <ShimmerBlock className="h-5 w-20 rounded-full" />
                <ShimmerBlock className="mt-4 h-6 w-[82%] rounded-sm" />
                <ShimmerBlock className="mt-2 h-4 w-24 rounded-sm" />
                <div className="mt-5 flex items-center justify-between gap-3">
                  <ShimmerBlock className="h-3.5 w-20 rounded-sm" />
                  <ShimmerBlock className="h-3.5 w-16 rounded-sm" />
                </div>
                <div className="mt-5 flex gap-2">
                  <ShimmerBlock className="h-6 w-16 rounded-full" />
                  <ShimmerBlock className="h-6 w-14 rounded-full" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading catalog</span>
    </section>
  )
}
