"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { clampCoverPan, computeCoverLayout, renderCoverCropToJpeg } from "@/lib/cover-crop"
import { cn } from "@/lib/utils"

export type DiscoverCoverAspect = "card" | "featured"

const ASPECT_LABEL: Record<DiscoverCoverAspect, string> = {
  card: "Browse cards (3:4)",
  featured: "Featured strip (16:9)",
}

type CoverImageCropPanelProps = {
  imageSrc: string
  aspect: DiscoverCoverAspect
  onAspectChange: (next: DiscoverCoverAspect) => void
  /** Called when the cropped JPEG changes (including after load / resize / pan). */
  onCroppedJpeg: (dataUrl: string | null) => void
  className?: string
}

export function CoverImageCropPanel({
  imageSrc,
  aspect,
  onAspectChange,
  onCroppedJpeg,
  className,
}: CoverImageCropPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ pointerId: number; startX: number; startY: number; ox: number; oy: number } | null>(null)

  const aspectRatio = aspect === "card" ? 3 / 4 : 16 / 9

  useEffect(() => {
    setLoadError(null)
    setNatural({ w: 0, h: 0 })
    setImgLoaded(false)
    setOffset({ x: 0, y: 0 })
  }, [imageSrc, aspect])

  const measure = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const w = Math.round(r.width)
    const h = Math.round(r.height)
    setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
  }, [])

  useEffect(() => {
    measure()
    const el = containerRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, aspectRatio])

  const layout =
    natural.w && natural.h && box.w && box.h
      ? computeCoverLayout(natural.w, natural.h, box.w, box.h)
      : null

  useEffect(() => {
    if (!natural.w || !natural.h || !box.w || !box.h) return
    const lay = computeCoverLayout(natural.w, natural.h, box.w, box.h)
    setOffset((prev) => clampCoverPan(prev.x, prev.y, box.w, box.h, lay.L, lay.T, lay.rw, lay.rh))
  }, [natural.w, natural.h, box.w, box.h])

  const exportCrop = useCallback(() => {
    const img = imgRef.current
    const cw = box.w
    const ch = box.h
    if (!img?.complete || !natural.w || !natural.h || !cw || !ch || !imgLoaded) {
      onCroppedJpeg(null)
      return
    }
    const jpeg = renderCoverCropToJpeg(img, cw, ch, offset.x, offset.y)
    onCroppedJpeg(jpeg)
  }, [box.w, box.h, natural.w, natural.h, offset.x, offset.y, onCroppedJpeg, imgLoaded])

  useEffect(() => {
    exportCrop()
  }, [exportCrop])

  const onImgLoad = () => {
    const img = imgRef.current
    if (!img) return
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    setImgLoaded(true)
    setLoadError(null)
  }

  const onImgError = () => {
    setNatural({ w: 0, h: 0 })
    setImgLoaded(false)
    setLoadError(
      "Could not load this image for cropping. Try a file upload, or a URL from a host that sends CORS headers for images.",
    )
    onCroppedJpeg(null)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!layout || !imgLoaded) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      ox: offset.x,
      oy: offset.y,
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId || !layout || !natural.w) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const next = clampCoverPan(d.ox + dx, d.oy + dy, box.w, box.h, layout.L, layout.T, layout.rw, layout.rh)
    setOffset(next)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const rw = layout?.rw ?? 0
  const rh = layout?.rh ?? 0
  const L = layout?.L ?? 0
  const T = layout?.T ?? 0

  const crossOrigin = imageSrc.startsWith("http") ? "anonymous" : undefined

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ASPECT_LABEL) as DiscoverCoverAspect[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onAspectChange(key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              aspect === key
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
            )}
          >
            {ASPECT_LABEL[key]}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag the image inside the frame to choose what shows on Discover. The cropped JPEG is used when you publish.
      </p>

      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}

      <div
        ref={containerRef}
        className={cn(
          "relative w-full max-w-md touch-none overflow-hidden rounded-lg border-2 border-dashed border-primary/40 bg-muted/30",
          imgLoaded && layout ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        style={{ aspectRatio: `${aspectRatio}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {!imgLoaded && !loadError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/20 text-sm text-muted-foreground">
            Loading preview…
          </div>
        ) : null}

        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          crossOrigin={crossOrigin}
          draggable={false}
          onLoad={onImgLoad}
          onError={onImgError}
          className={cn("pointer-events-none select-none", !imgLoaded && "opacity-0")}
          style={
            imgLoaded && layout
              ? {
                  position: "absolute",
                  width: rw,
                  height: rh,
                  left: L + offset.x,
                  top: T + offset.y,
                  maxWidth: "none",
                }
              : { position: "absolute", visibility: "hidden" as const }
          }
        />
      </div>
    </div>
  )
}
